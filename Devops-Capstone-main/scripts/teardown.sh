#!/usr/bin/env bash
# teardown.sh — destroy all AWS resources via terraform destroy.
# Run this at the end of EVERY work session to avoid surprise bills.
# RDS + EC2 + ALB running 24/7 will exceed the free tier.
set -euo pipefail

TERRAFORM_DIR="$(cd "$(dirname "$0")/../terraform" && pwd)"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

warn()  { echo -e "${YELLOW}  !${NC} $1"; }
ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
die()   { echo -e "${RED}  ✗ ERROR:${NC} $1"; exit 1; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
command -v terraform &>/dev/null || die "terraform not found"
command -v aws       &>/dev/null || die "aws cli not found"
aws sts get-caller-identity &>/dev/null || die "AWS credentials not valid"

[ -n "${TF_VAR_db_password:-}" ] || die "TF_VAR_db_password is not set — required for terraform destroy"
[ -n "${TF_VAR_k3s_token:-}"   ] || die "TF_VAR_k3s_token is not set — required for terraform destroy"

# ── Show what will be destroyed ───────────────────────────────────────────────
echo ""
echo -e "${RED}╔══════════════════════════════════════════╗${NC}"
echo -e "${RED}║         TEARDOWN — DESTROY ALL           ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════╝${NC}"
echo ""
warn "This will DESTROY all AWS resources managed by Terraform:"
echo ""
echo "    • EC2 instances (k3s control-plane + all worker nodes)"
echo "    • Application Load Balancer"
echo "    • RDS PostgreSQL instance (ALL DATA WILL BE LOST)"
echo "    • VPC, subnets, security groups, NAT instance"
echo "    • ECR repositories and their images"
echo "    • IAM roles and OIDC provider"
echo ""
warn "The S3 state bucket and DynamoDB lock table are NOT destroyed"
warn "(they are managed outside Terraform — delete manually if needed)"
echo ""

# ── Double confirmation ───────────────────────────────────────────────────────
read -rp "  Type 'destroy' to confirm: " CONFIRM_1
if [ "$CONFIRM_1" != "destroy" ]; then
  echo "  Aborted — nothing was changed."
  exit 0
fi

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region 2>/dev/null || echo "unknown")
echo ""
read -rp "  Destroying resources in AWS account $ACCOUNT / region $REGION. Are you sure? [y/N] " CONFIRM_2
if [[ ! "$CONFIRM_2" =~ ^[Yy]$ ]]; then
  echo "  Aborted — nothing was changed."
  exit 0
fi

# ── Terraform destroy ─────────────────────────────────────────────────────────
echo ""
echo "  Running terraform destroy..."
echo ""

cd "$TERRAFORM_DIR"

terraform init -input=false -reconfigure 2>/dev/null || terraform init -input=false

terraform destroy \
  -auto-approve \
  -var="github_repo=${TF_VAR_github_repo:-placeholder/repo}"

echo ""
ok "Terraform destroy complete — all managed resources are gone"

# ── Post-teardown reminder ────────────────────────────────────────────────────
echo ""
echo "  Resources that still exist (manual cleanup if needed):"
echo "    • S3 bucket: marketly-terraform-state"
echo "    • DynamoDB table: marketly-terraform-locks"
echo "    • GitHub Actions self-hosted runner (deregister from repo settings)"
echo ""
echo -e "${GREEN}  Work session ended — no runaway AWS costs. ✓${NC}"
echo ""