#!/usr/bin/env bash
# deploy.sh — local wrapper for terraform apply + kubectl apply.
# Use this to test infra/deploy changes without waiting on GitHub Actions.
# Production deployments go through CI/CD; this is for development iteration.
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
TERRAFORM_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"
K8S_DIR="$(cd "$(dirname "$0")/../k8s" && pwd)"
NAMESPACE="marketly"
AWS_REGION="${AWS_REGION:-us-east-1}"

# ── Colours ───────────────────────────────────────────────────────────────────
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step()  { echo -e "\n${BLUE}▶${NC} $1"; }
ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
warn()  { echo -e "${YELLOW}  !${NC} $1"; }
die()   { echo -e "${RED}  ✗ ERROR:${NC} $1"; exit 1; }

# ── Parse args ────────────────────────────────────────────────────────────────
DEPLOY_INFRA=false
DEPLOY_K8S=false
IMAGE_TAG="${IMAGE_TAG:-latest}"

usage() {
  echo ""
  echo "Usage: $0 [--infra] [--k8s] [--tag <image-tag>] [--all]"
  echo ""
  echo "  --infra       Run terraform apply"
  echo "  --k8s         Run kubectl apply for all manifests"
  echo "  --tag <tag>   Image tag to deploy (default: latest)"
  echo "  --all         Run both terraform and kubectl"
  echo ""
  exit 1
}

[ $# -eq 0 ] && usage

while [[ $# -gt 0 ]]; do
  case $1 in
    --infra) DEPLOY_INFRA=true; shift ;;
    --k8s)   DEPLOY_K8S=true;   shift ;;
    --all)   DEPLOY_INFRA=true; DEPLOY_K8S=true; shift ;;
    --tag)   IMAGE_TAG="$2";    shift 2 ;;
    -h|--help) usage ;;
    *) die "Unknown argument: $1" ;;
  esac
done

# ── Pre-flight checks ─────────────────────────────────────────────────────────
step "Pre-flight checks"

command -v terraform &>/dev/null || die "terraform not found — run scripts/setup.sh first"
command -v kubectl   &>/dev/null || die "kubectl not found — run scripts/setup.sh first"
command -v aws       &>/dev/null || die "aws cli not found — run scripts/setup.sh first"

aws sts get-caller-identity &>/dev/null || die "AWS credentials not valid — run: aws configure"

[ -n "${TF_VAR_db_password:-}" ] || die "TF_VAR_db_password is not set"
[ -n "${TF_VAR_k3s_token:-}"   ] || die "TF_VAR_k3s_token is not set"

ok "All pre-flight checks passed"

# ── Terraform apply ───────────────────────────────────────────────────────────
if $DEPLOY_INFRA; then
  step "Terraform apply (region: $AWS_REGION)"

  cd "$TERRAFORM_DIR"

  terraform init -input=false
  terraform validate

  echo ""
  terraform plan -out=tfplan -input=false
  echo ""

  read -rp "  Apply the plan above? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

  terraform apply tfplan
  ok "Terraform apply complete"

  # Export outputs for the kubectl step
  ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
  ECR_REGISTRY=$(terraform output -json ecr_repository_urls 2>/dev/null | \
    jq -r '.["auth-service"]' | cut -d/ -f1 || echo "")
  CONTROL_PLANE_ID=$(terraform output -raw control_plane_instance_id 2>/dev/null || echo "")

  echo ""
  echo "  ALB DNS:           $ALB_DNS"
  echo "  ECR Registry:      $ECR_REGISTRY"
  echo "  Control-plane ID:  $CONTROL_PLANE_ID"

  cd - > /dev/null
fi

# ── kubectl apply ─────────────────────────────────────────────────────────────
if $DEPLOY_K8S; then
  step "Deploying k8s manifests (namespace: $NAMESPACE, tag: $IMAGE_TAG)"

  # Verify kubectl can reach the cluster
  kubectl get nodes &>/dev/null || die "kubectl cannot reach the cluster — is KUBECONFIG set?"

  # Apply in dependency order
  echo "  Applying namespace..."
  kubectl apply -f "$K8S_DIR/namespace.yaml"

  echo "  Applying secrets..."
  kubectl apply -f "$K8S_DIR/auth-service/secret.yaml"
  kubectl apply -f "$K8S_DIR/catalog-service/secret.yaml"
  kubectl apply -f "$K8S_DIR/orders-service/secret.yaml"

  echo "  Applying services and deployments..."
  kubectl apply -f "$K8S_DIR/catalog-service/"
  kubectl apply -f "$K8S_DIR/auth-service/"
  kubectl apply -f "$K8S_DIR/orders-service/"
  kubectl apply -f "$K8S_DIR/frontend/"

  echo "  Applying ingress and HPA..."
  kubectl apply -f "$K8S_DIR/ingress.yaml"
  kubectl apply -f "$K8S_DIR/hpa.yaml"

  # If a specific image tag was requested, update all deployments to use it
  if [ "$IMAGE_TAG" != "latest" ]; then
    step "Updating image tags to: $IMAGE_TAG"
    ECR_REGISTRY="${ECR_REGISTRY:-${AWS_ACCOUNT_ID:-}.dkr.ecr.$AWS_REGION.amazonaws.com}"

    for svc in auth-service catalog-service orders-service frontend; do
      kubectl set image deployment/$svc \
        $svc=$ECR_REGISTRY/marketly/$svc:$IMAGE_TAG \
        -n $NAMESPACE
      ok "Updated $svc → $IMAGE_TAG"
    done
  fi

  # Wait for all rollouts
  step "Waiting for rollouts to complete..."
  for svc in auth-service catalog-service orders-service frontend; do
    echo -n "  $svc ... "
    kubectl rollout status deployment/$svc -n $NAMESPACE --timeout=120s
  done

  ok "All deployments rolled out successfully"

  echo ""
  kubectl get pods -n $NAMESPACE
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""