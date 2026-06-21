#!/bin/bash
set -euo pipefail

# Start SSM agent FIRST, before anything else can fail — this guarantees
# we always have a way into the box via Session Manager, even if the
# k3s install below has problems.
systemctl enable --now amazon-ssm-agent || true

# Install k3s as a server (control-plane).
# --disable traefik=false  -> keep Traefik (bundled ingress controller)
# --node-external-ip       -> not set; nodes stay private, ALB handles ingress
curl -sfL https://get.k3s.io | K3S_TOKEN="${k3s_token}" sh -s - server \
  --disable=servicelb \
  --write-kubeconfig-mode=644

# k3s installs its binary at this fixed path — use it directly instead of
# relying on a PATH that may not be refreshed in this non-interactive shell.
K3S_BIN=/usr/local/bin/k3s

# Wait until k3s API is healthy. Loop with a cap instead of an unbounded
# until-loop, and don't let a single failed check kill the whole script.
for i in $(seq 1 60); do
  if $K3S_BIN kubectl get nodes >/dev/null 2>&1; then
    echo "k3s control-plane is ready"
    break
  fi
  echo "Waiting for k3s API... attempt $i"
  sleep 5
done
