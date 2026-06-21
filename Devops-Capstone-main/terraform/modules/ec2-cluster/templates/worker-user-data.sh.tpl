#!/bin/bash
set -euo pipefail

# Start SSM agent FIRST so workers are always reachable via Session Manager
# even if the k3s join step below fails.
systemctl enable --now amazon-ssm-agent || true

# Install k3s as an agent (worker). It discovers the control-plane via
# its private IP and joins using the shared K3S_TOKEN.
curl -sfL https://get.k3s.io | \
  K3S_URL="https://${control_plane_private_ip}:6443" \
  K3S_TOKEN="${k3s_token}" \
  sh -s - agent
