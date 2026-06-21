#!/usr/bin/env bash
# setup.sh — verify all required CLI tools are installed and configured
# before anyone wastes an hour debugging a missing dependency.
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

ok()   { echo -e "${GREEN}  ✓${NC} $1"; ((PASS++)); }
fail() { echo -e "${RED}  ✗${NC} $1"; ((FAIL++)); }
info() { echo -e "${YELLOW}  →${NC} $1"; }

echo ""
echo "═══════════════════════════════════════════"
echo "  Marketly DevOps — Environment Check"
echo "═══════════════════════════════════════════"
echo ""

# ── Required CLI tools ────────────────────────────────────────────────────────
echo "── Required tools ──────────────────────────"

check_tool() {
  local cmd=$1
  local min_version_hint=$2
  if command -v "$cmd" &>/dev/null; then
    local version
    version=$("$cmd" --version 2>&1 | head -1)
    ok "$cmd  ($version)"
  else
    fail "$cmd not found — install it first"
    info "Hint: $min_version_hint"
  fi
}

check_tool "git"       "sudo apt install git"
check_tool "docker"    "https://docs.docker.com/engine/install/"
check_tool "terraform" "https://developer.hashicorp.com/terraform/install  (need >= 1.6)"
check_tool "aws"       "pip install awscli  or  https://aws.amazon.com/cli/"
check_tool "kubectl"   "sudo snap install kubectl --classic"
check_tool "curl"      "sudo apt install curl"
check_tool "jq"        "sudo apt install jq  (used by healthcheck.sh)"

echo ""

# ── Docker daemon running? ────────────────────────────────────────────────────
echo "── Docker daemon ───────────────────────────"
if docker info &>/dev/null; then
  ok "Docker daemon is running"
else
  fail "Docker daemon is NOT running — start it with: sudo systemctl start docker"
  info "Also make sure your user is in the docker group: sudo usermod -aG docker \$USER"
fi

echo ""

# ── AWS credentials configured? ───────────────────────────────────────────────
echo "── AWS credentials ─────────────────────────"
if aws sts get-caller-identity &>/dev/null; then
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
  REGION=$(aws configure get region 2>/dev/null || echo "not set")
  ok "AWS credentials valid  (account: $ACCOUNT, region: $REGION)"
else
  fail "AWS credentials not configured or expired"
  info "Run: aws configure   (or set AWS_PROFILE / AWS_ACCESS_KEY_ID env vars)"
fi

echo ""

# ── Terraform version ─────────────────────────────────────────────────────────
echo "── Terraform version ───────────────────────"
if command -v terraform &>/dev/null; then
  TF_VERSION=$(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || terraform version | head -1 | grep -oP '\d+\.\d+\.\d+')
  MAJOR=$(echo "$TF_VERSION" | cut -d. -f1)
  MINOR=$(echo "$TF_VERSION" | cut -d. -f2)
  if [ "$MAJOR" -ge 1 ] && [ "$MINOR" -ge 6 ]; then
    ok "Terraform $TF_VERSION (>= 1.6 required)"
  else
    fail "Terraform $TF_VERSION is too old — need >= 1.6.0"
  fi
fi

echo ""

# ── Terraform state bucket exists? ────────────────────────────────────────────
echo "── Terraform remote state ──────────────────"
STATE_BUCKET="marketly-terraform-state"   # must match backend.tf
LOCK_TABLE="marketly-terraform-locks"

if aws s3 ls "s3://$STATE_BUCKET" &>/dev/null; then
  ok "S3 state bucket exists: $STATE_BUCKET"
else
  fail "S3 bucket '$STATE_BUCKET' not found"
  info "Create it manually before running terraform init (see Phase 4 setup)"
fi

if aws dynamodb describe-table --table-name "$LOCK_TABLE" &>/dev/null; then
  ok "DynamoDB lock table exists: $LOCK_TABLE"
else
  fail "DynamoDB table '$LOCK_TABLE' not found"
  info "Create it with partition key 'LockID' (String) in the AWS console"
fi

echo ""

# ── Required env vars ─────────────────────────────────────────────────────────
echo "── Required env vars ───────────────────────"
for var in TF_VAR_db_password TF_VAR_k3s_token; do
  if [ -n "${!var:-}" ]; then
    ok "$var is set"
  else
    fail "$var is NOT set"
    info "export $var=<value>  before running terraform"
  fi
done

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}  All $PASS checks passed — you're good to go!${NC}"
else
  echo -e "${RED}  $FAIL check(s) failed, $PASS passed.${NC}"
  echo -e "  Fix the failures above before proceeding."
  exit 1
fi
echo "═══════════════════════════════════════════"
echo ""