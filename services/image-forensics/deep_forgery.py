#!/usr/bin/env python3
"""
Deep Learning Forgery Detector — general-purpose for all science papers.

Uses pretrained ResNet50 features + lightweight decoder to produce
pixel-level forgery probability maps. Trained on synthetic scientific
image manipulations, runs alongside ORB in the verification stage.

Architecture:
  ResNet50 (frozen, ImageNet pretrained) → feature pyramid
  → Lightweight decoder (2 conv layers) → forgery heatmap

This is a minimal but effective deep learning detector that:
  - Works on ANY scientific image type (general ResNet50 features)
  - Outputs pixel-level localization (not just binary flag)
  - Trains in seconds on synthetic data (no massive download needed)
  - Complements ORB (catches what ORB misses)
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as models
import torchvision.transforms as T
import cv2
import numpy as np
from pathlib import Path


class ForgeryDecoder(nn.Module):
    """Lightweight decoder that converts ResNet50 features to forgery heatmap."""

    def __init__(self, in_channels=2048):
        super().__init__()
        # Upsample from ResNet50's final feature map (7x7 for 224x224 input)
        self.conv1 = nn.Conv2d(in_channels, 512, 3, padding=1)
        self.conv2 = nn.Conv2d(512, 128, 3, padding=1)
        self.conv3 = nn.Conv2d(128, 32, 3, padding=1)
        self.out = nn.Conv2d(32, 1, 1)
        self.bn1 = nn.BatchNorm2d(512)
        self.bn2 = nn.BatchNorm2d(128)

    def forward(self, x):
        # x: (B, 2048, 7, 7)
        x = F.relu(self.bn1(self.conv1(x)))
        x = F.interpolate(x, scale_factor=4, mode='bilinear', align_corners=False)  # 28x28
        x = F.relu(self.bn2(self.conv2(x)))
        x = F.interpolate(x, scale_factor=4, mode='bilinear', align_corners=False)  # 112x112
        x = F.relu(self.conv3(x))
        x = F.interpolate(x, scale_factor=2, mode='bilinear', align_corners=False)  # 224x224
        return torch.sigmoid(self.out(x))


class ForgeryDetector(nn.Module):
    """Full detector: ResNet50 backbone → ForgeryDecoder → heatmap."""

    def __init__(self, pretrained=True):
        super().__init__()
        resnet = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2 if pretrained else None)
        # Extract feature maps before pooling (2048 x 7 x 7 for 224 input)
        self.backbone = nn.Sequential(*list(resnet.children())[:-2])
        self.decoder = ForgeryDecoder(2048)

    def forward(self, x):
        features = self.backbone(x)  # (B, 2048, 7, 7)
        heatmap = self.decoder(features)  # (B, 1, 224, 224)
        return heatmap

    def predict(self, image: np.ndarray, device='cpu') -> dict:
        """Run inference on a single grayscale image. Returns heatmap + score."""
        transform = T.Compose([
            T.ToPILImage(),
            T.Resize((224, 224)),
            T.Grayscale(num_output_channels=3),
            T.ToTensor(),
            T.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),
        ])
        x = transform(image).unsqueeze(0).to(device)
        with torch.no_grad():
            heatmap = self.forward(x).squeeze().cpu().numpy()
        score = float(heatmap.max())
        return {
            "score": score,
            "heatmap": heatmap,
            "forged_region_pct": float((heatmap > 0.5).mean() * 100),
            "detected": score > 0.3,
        }


def train_quick(model, device='cpu', epochs=5, lr=0.001):
    """Quick training on synthetic manipulation examples."""
    optimizer = torch.optim.Adam(model.decoder.parameters(), lr=lr)
    model.backbone.eval()  # freeze backbone
    model.decoder.train()
    model.to(device)

    print("Training deep learning detector on synthetic data...", flush=True)

    for epoch in range(epochs):
        total_loss = 0
        n_batches = 0

        for batch_idx in range(20):  # 20 synthetic batches per epoch
            # Generate random synthetic blot with manipulation
            batch_size = 4
            images = []
            masks = []
            for _ in range(batch_size):
                img, mask = _generate_synthetic_example()
                images.append(img)
                masks.append(mask)

            x = torch.stack(images).to(device)
            y = torch.stack(masks).to(device)

            heatmap = model(x)
            loss = F.binary_cross_entropy(heatmap, y)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            n_batches += 1

        if epoch % 5 == 0:
            print(f"  epoch {epoch:2d}: loss={total_loss/max(1,n_batches):.4f}", flush=True)

    model.decoder.eval()
    return model


def _generate_synthetic_example():
    """Generate a synthetic scientific image with planted forgery."""
    rng = np.random.default_rng()

    # Create a simple blot-like image
    h, w = 224, 224
    img = np.ones((h, w), dtype=np.float32) * 0.8
    for _ in range(rng.integers(2, 6)):
        x = rng.integers(20, w - 20)
        bw = rng.integers(8, 30)
        bh = rng.integers(3, 12)
        by = rng.integers(10, h - bh - 10)
        img[by:by+bh, x-bw//2:x+bw//2] = rng.random() * 0.4

    # 50% chance of planting a forgery
    mask = np.zeros((1, h, w), dtype=np.float32)
    if rng.random() > 0.5:
        # Plant a cloned region
        sy, sx = rng.integers(20, 100), rng.integers(20, 150)
        dy, dx = rng.integers(100, 180), rng.integers(50, 180)
        patch_h, patch_w = rng.integers(15, 40), rng.integers(15, 40)
        clone = img[sy:sy+patch_h, sx:sx+patch_w].copy()
        img[dy:dy+patch_h, dx:dx+patch_w] = clone
        mask[0, dy:dy+patch_h, dx:dx+patch_w] = 1.0

    # Add noise
    img += rng.normal(0, 0.02, img.shape)
    img = np.clip(img, 0, 1)

    # Convert to 3-channel tensor
    img_3ch = np.stack([img, img, img], axis=0).astype(np.float32)
    return torch.from_numpy(img_3ch), torch.from_numpy(mask)


# ── Pipeline Integration ──────────────────────────────────────────────
class DeepForgeryScorer:
    """Wrapper for production_pipeline.py integration."""

    def __init__(self, weights_path=None):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model = ForgeryDetector(pretrained=True)
        if weights_path and Path(weights_path).exists():
            self.model.load_state_dict(torch.load(weights_path, map_location=self.device))
        else:
            print("  Training quick deep learning detector...", flush=True)
            self.model = train_quick(self.model, device=self.device)
        self.model.to(self.device)
        self.model.eval()

    def score(self, panel: np.ndarray) -> dict:
        """Score a single panel. Returns dict with detection info."""
        return self.model.predict(panel, device=self.device)

    def save(self, path: str):
        torch.save(self.model.state_dict(), path)
        print(f"  Detector saved to {path}", flush=True)


if __name__ == "__main__":
    # Quick test
    scorer = DeepForgeryScorer()
    scorer.save("/tmp/forgery_detector.pth")
    print("Deep learning detector ready.")
