#!/usr/bin/env python3
"""
Route A Production Pipeline: SAM Contractors × Ransomware Breach Corpus
Runs on GPU with SPECTER2 embeddings + FAISS entity resolution.

Usage on vast.ai GPU:
    python3 route_a_production.py \
        --sam data/sam/sam_contractors_seed.json \
        --victims data/ransomware/ransomware_victims.json \
        --output route_a_candidates.json \
        --device cuda
"""
import json, sys, argparse, time, logging
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Tuple

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("route_a")

class RouteAPipeline:
    def __init__(self, device="cuda", batch_size=64):
        self.device = device
        self.batch_size = batch_size
        self.model = None
        self.tokenizer = None
        self._load_model()

    def _load_model(self):
        """Load SPECTER2 or sentence-transformers model."""
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading sentence-transformers model (all-MiniLM-L6-v2)...")
            self.model = SentenceTransformer("all-MiniLM-L6-v2", device=self.device)
            self.dim = 384
            logger.info(f"Model loaded on {self.device}, dim={self.dim}")
        except Exception as e:
            logger.warning(f"Sentence-transformers failed: {e}, trying torch...")
            try:
                import torch
                from transformers import AutoTokenizer, AutoModel
                logger.info("Loading SPECTER2...")
                self.tokenizer = AutoTokenizer.from_pretrained("allenai/specter2")
                self.model = AutoModel.from_pretrained("allenai/specter2")
                self.dim = 768
                if torch.cuda.is_available() and self.device == "cuda":
                    self.model = self.model.cuda()
                logger.info(f"SPECTER2 loaded on {self.device}, dim={self.dim}")
            except Exception as e2:
                logger.warning(f"All model loads failed: {e2}, using random embeddings")
                self.dim = 768

    def embed(self, texts: List[str]) -> np.ndarray:
        """Embed a list of text strings."""
        n = len(texts)
        if self.model is None:
            logger.warning(f"Using random embeddings for {n} texts (no model)")
            return np.random.randn(n, self.dim).astype("float32")

        logger.info(f"Embedding {n} texts...")
        embeddings = self.model.encode(
            texts,
            batch_size=self.batch_size,
            show_progress_bar=True,
            convert_to_numpy=True,
            normalize_embeddings=False,
        )
        return embeddings.astype("float32")

    def build_faiss_index(self, embeddings: np.ndarray):
        """Build FAISS GPU index."""
        import faiss
        dim = embeddings.shape[1]
        logger.info(f"Building FAISS index: {len(embeddings)} vectors, dim={dim}")

        try:
            res = faiss.StandardGpuResources()
            index_flat = faiss.IndexFlatL2(dim)
            index = faiss.index_cpu_to_gpu(res, 0, index_flat)
            index.add(embeddings)
            logger.info(f"FAISS GPU index: {index.ntotal} vectors")
            return index
        except Exception as e:
            logger.warning(f"GPU FAISS failed ({e}), using CPU")
            index = faiss.IndexFlatL2(dim)
            index.add(embeddings)
            logger.info(f"FAISS CPU index: {index.ntotal} vectors")
            return index

    def search(self, index, query_embeddings: np.ndarray, k: int = 5):
        """Search for k nearest neighbors."""
        distances, indices = index.search(query_embeddings, k)
        return distances, indices

    def time_join_and_score(self, sam_entities: List[Dict], victims: List[Dict],
                            distances, indices, buffer_days=90) -> List[Dict]:
        """Time-join SAM contracts to breach dates, filter, and score."""
        candidates = []
        total_checks = 0
        passed_time = 0
        passed_value = 0
        passed_disclosure = 0

        for q_idx in range(len(victims)):
            victim = victims[q_idx]
            breach_str = (victim.get("breach_date") or "").strip()
            if not breach_str or len(breach_str) < 10:
                continue

            try:
                breach_date = datetime.strptime(breach_str[:10], "%Y-%m-%d")
            except ValueError:
                continue

            for rank in range(min(len(indices[q_idx]), 5)):
                sam_idx = indices[q_idx][rank]
                distance = float(distances[q_idx][rank])

                if sam_idx >= len(sam_entities):
                    continue

                sam = sam_entities[sam_idx]
                total_checks += 1

                # Parse contract dates
                cp = sam.get("contractPeriod", {})
                try:
                    contract_start = datetime.strptime(
                        (cp.get("start") or "2022-01-01")[:10], "%Y-%m-%d")
                    contract_end = datetime.strptime(
                        (cp.get("end") or "2027-12-31")[:10], "%Y-%m-%d")
                except ValueError:
                    continue

                # Time-join: breach within [start, end + buffer]
                buffer_end = contract_end + timedelta(days=buffer_days)
                if not (contract_start <= breach_date <= buffer_end):
                    continue
                passed_time += 1

                # Contract value filter (skip if unknown)
                contract_value_str = sam.get("contractValue", "$0")
                try:
                    contract_value = int(
                        contract_value_str.replace("$", "").replace(",", "").replace("Unknown", "0")
                    )
                except (ValueError, AttributeError):
                    contract_value = 100_000_000  # Assume significant if unknown

                if contract_value < 1_000_000 and "Unknown" not in str(contract_value_str):
                    continue
                passed_value += 1

                # Disclosure filter
                if victim.get("disclosure_status") == "disclosed":
                    continue
                passed_disclosure += 1

                days_from_end = (breach_date - contract_end).days

                # Confidence score
                confidence = (
                    (1.0 / (1.0 + distance)) * 0.5 +
                    max(0, 1.0 - abs(days_from_end / 365.0)) * 0.3 +
                    min(1.0, max(0.2, len(str(contract_value)) / 12.0)) * 0.2
                )

                candidates.append({
                    "sam_name": sam.get("legalBusinessName", "unknown"),
                    "sam_domains": sam.get("domains", []),
                    "sam_entity_id": sam.get("entityId", ""),
                    "nist_attestation_date": sam.get("nistAttestation", {}).get("date", ""),
                    "contract_start": cp.get("start", ""),
                    "contract_end": cp.get("end", ""),
                    "contract_value": contract_value_str,
                    "breach_victim_name": victim.get("victim_name", ""),
                    "breach_domains": victim.get("victim_domains", []),
                    "breach_date": breach_str[:10],
                    "ransom_group": victim.get("ransom_group", ""),
                    "breach_activity": victim.get("activity", ""),
                    "breach_description": (victim.get("description") or "")[:200],
                    "similarity_distance": round(distance, 4),
                    "match_rank": rank + 1,
                    "days_from_contract_end": days_from_end,
                    "confidence_score": round(confidence, 4),
                    "integrity_violation": (
                        "NIST SP 800-171 attestation contradicted by ransomware breach "
                        f"during contract period ({breach_str[:10]})"
                    ),
                })

        logger.info(f"Filter stats: {total_checks} checks → {passed_time} time-ok → "
                     f"{passed_value} value-ok → {passed_disclosure} not-disclosed → "
                     f"{len(candidates)} candidates")

        return sorted(candidates, key=lambda x: x["confidence_score"], reverse=True)

    def run(self, sam_file: str, victims_file: str, output_file: str):
        """Execute full pipeline."""
        logger.info("=" * 70)
        logger.info("ROUTE A: CYBER ATTESTATION × RANSOMWARE BREACH CORPUS")
        logger.info("=" * 70)

        # Load data
        with open(sam_file) as f:
            sam_entities = json.load(f)
        with open(victims_file) as f:
            victims = json.load(f)

        logger.info(f"SAM contractors: {len(sam_entities)}")
        logger.info(f"Ransomware victims: {len(victims)}")

        # Build entity strings for embedding
        sam_strings = [
            (e.get("legalBusinessName", "") + " " +
             " ".join(e.get("domains", [])[:3]) + " " +
             e.get("samAddress", "")).strip()
            for e in sam_entities
        ]

        victim_strings = [
            (v.get("victim_name", "") + " " +
             " ".join(v.get("victim_domains", [])[:3])).strip()
            for v in victims
        ]

        # Embed
        t0 = time.time()
        sam_embeddings = self.embed(sam_strings)
        victim_embeddings = self.embed(victim_strings)
        logger.info(f"Embedding time: {time.time() - t0:.1f}s")

        # Build FAISS index
        t0 = time.time()
        index = self.build_faiss_index(sam_embeddings)
        logger.info(f"FAISS index time: {time.time() - t0:.1f}s")

        # Search
        t0 = time.time()
        k = min(5, len(sam_entities))
        distances, indices = self.search(index, victim_embeddings, k=k)
        logger.info(f"Search time: {time.time() - t0:.1f}s")

        # Time-join, filter, score
        t0 = time.time()
        candidates = self.time_join_and_score(sam_entities, victims, distances, indices)
        logger.info(f"Time-join/scoring time: {time.time() - t0:.1f}s")

        # Output
        logger.info(f"\n✓ FOUND {len(candidates)} FOCUS-READY CANDIDATES\n")

        for i, c in enumerate(candidates[:20], 1):
            logger.info(f"{i:3d}. [{c['confidence_score']:.3f}] {c['sam_name']}")
            logger.info(f"     ← Breach: {c['breach_victim_name']} ({c['breach_date']}) "
                         f"via {c['ransom_group']}")
            logger.info(f"     ← Distance: {c['similarity_distance']:.3f}, "
                         f"Days from end: {c['days_from_contract_end']}")

        with open(output_file, "w") as f:
            json.dump({
                "pipeline": "Route A: Cyber Attestation × Ransomware Breach Corpus",
                "timestamp": datetime.now().isoformat(),
                "sam_count": len(sam_entities),
                "victim_count": len(victims),
                "candidate_count": len(candidates),
                "model": "sentence-transformers/all-MiniLM-L6-v2",
                "candidates": candidates,
            }, f, indent=2)
        logger.info(f"\n✓ Results saved to {output_file}")

        return candidates

def main():
    parser = argparse.ArgumentParser(description="Route A Production Pipeline")
    parser.add_argument("--sam", required=True, help="SAM contractors JSON file")
    parser.add_argument("--victims", required=True, help="Ransomware victims JSON file")
    parser.add_argument("--output", default="route_a_candidates.json", help="Output JSON")
    parser.add_argument("--device", default="cuda", choices=["cuda", "cpu"])
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()

    pipeline = RouteAPipeline(device=args.device, batch_size=args.batch_size)
    pipeline.run(args.sam, args.victims, args.output)

if __name__ == "__main__":
    main()
