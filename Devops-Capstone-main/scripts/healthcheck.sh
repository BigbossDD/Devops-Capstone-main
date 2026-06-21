#!/usr/bin/env bash
# healthcheck.sh — your first debugging tool when something looks broken.
# Checks pod status in the cluster AND curls /health on all 3 backend services.
set -euo pipefail

NAMESPACE="marketly"
TIMEOUT=5   # seconds per curl

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0

ok()   { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
info() { echo -e "  ${YELLOW}→${NC} $1"; }
step() { echo -e "\n${BLUE}▶${NC} $1"; }

# ── Parse args ────────────────────────────────────────────────────────────────
USE_ALB=false
ALB_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --alb)  USE_ALB=true; ALB_URL="$2"; shift 2 ;;
    --ns)   NAMESPACE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--alb <alb-dns-url>] [--ns <namespace>]"
      echo ""
      echo "  --alb <url>   Also test health through the ALB (e.g. http://my-alb.amazonaws.com)"
      echo "  --ns <name>   Kubernetes namespace (default: marketly)"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo ""
echo "═══════════════════════════════════════════"
echo "  Marketly — Health Check"
echo "  Namespace: $NAMESPACE"
echo "═══════════════════════════════════════════"

# ── 1. Cluster connectivity ───────────────────────────────────────────────────
step "Cluster connectivity"
if kubectl get nodes &>/dev/null; then
  NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
  READY_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready" || true)
  ok "kubectl connected — $READY_COUNT/$NODE_COUNT nodes Ready"
  kubectl get nodes --no-headers | awk '{printf "    %-40s %s\n", $1, $2}'
else
  fail "kubectl cannot reach the cluster — is KUBECONFIG set correctly?"
  echo ""
  echo "  Tip: export KUBECONFIG=/etc/rancher/k3s/k3s.yaml"
  exit 1
fi

# ── 2. Pod status ─────────────────────────────────────────────────────────────
step "Pod status (namespace: $NAMESPACE)"

if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
  fail "Namespace '$NAMESPACE' does not exist — have you run kubectl apply -f k8s/namespace.yaml?"
  exit 1
fi

PODS=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null)
if [ -z "$PODS" ]; then
  fail "No pods found in namespace $NAMESPACE"
else
  echo "$PODS" | while IFS= read -r line; do
    POD_NAME=$(echo "$line" | awk '{print $1}')
    READY=$(echo "$line"    | awk '{print $2}')
    STATUS=$(echo "$line"   | awk '{print $3}')
    RESTARTS=$(echo "$line" | awk '{print $4}')

    if [ "$STATUS" = "Running" ]; then
      ok "$POD_NAME  [$READY] restarts=$RESTARTS"
    else
      fail "$POD_NAME  [$READY] status=$STATUS restarts=$RESTARTS"
    fi
  done
fi

# ── 3. Deployment rollout status ──────────────────────────────────────────────
step "Deployment rollout status"
for svc in auth-service catalog-service orders-service frontend; do
  if kubectl get deployment "$svc" -n "$NAMESPACE" &>/dev/null; then
    DESIRED=$(kubectl get deployment "$svc" -n "$NAMESPACE" \
      -o jsonpath='{.spec.replicas}' 2>/dev/null)
    READY=$(kubectl get deployment "$svc" -n "$NAMESPACE" \
      -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    if [ "${READY:-0}" = "$DESIRED" ]; then
      ok "$svc — $READY/$DESIRED replicas ready"
    else
      fail "$svc — ${READY:-0}/$DESIRED replicas ready"
      info "Check logs: kubectl logs deployment/$svc -n $NAMESPACE --tail=20"
    fi
  else
    fail "$svc deployment not found"
    info "Deploy it: kubectl apply -f k8s/$svc/"
  fi
done

# ── 4. /health endpoint checks via port-forward ───────────────────────────────
step "/health endpoint checks (via kubectl port-forward)"

check_health() {
  local svc=$1
  local port=$2

  # Check the service exists before trying to port-forward
  if ! kubectl get svc "$svc" -n "$NAMESPACE" &>/dev/null; do
    fail "$svc: Service not found"
    return
  fi

  # Start port-forward in background
  kubectl port-forward "svc/$svc" "${port}:${port}" -n "$NAMESPACE" \
    --address 127.0.0.1 &>/dev/null &
  PF_PID=$!
  sleep 2   # give port-forward time to establish

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time $TIMEOUT "http://127.0.0.1:${port}/health" 2>/dev/null || echo "000")

  kill $PF_PID 2>/dev/null || true
  wait $PF_PID 2>/dev/null || true

  if [ "$HTTP_STATUS" = "200" ]; then
    ok "$svc /health → HTTP $HTTP_STATUS"
  else
    fail "$svc /health → HTTP $HTTP_STATUS  (expected 200)"
    info "Debug: kubectl logs deployment/$svc -n $NAMESPACE --tail=30"
  fi
}

check_health "auth-service"    5001
check_health "catalog-service" 5002
check_health "orders-service"  5003

# ── 5. Optional — check through the ALB ──────────────────────────────────────
if $USE_ALB; then
  step "ALB end-to-end checks ($ALB_URL)"

  for path in "/api/auth/me" "/api/products" "/api/orders"; do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time $TIMEOUT "${ALB_URL}${path}" 2>/dev/null || echo "000")

    # /api/auth/me returns 401 without a token — that's correct behaviour
    # /api/products should return 200
    # /api/orders returns 401 without a token — also correct
    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "401" ]; then
      ok "ALB → $path → HTTP $HTTP_STATUS"
    else
      fail "ALB → $path → HTTP $HTTP_STATUS  (got unexpected status)"
    fi
  done

  # Frontend — should return 200 HTML
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time $TIMEOUT "$ALB_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    ok "ALB → / (frontend) → HTTP $HTTP_STATUS"
  else
    fail "ALB → / (frontend) → HTTP $HTTP_STATUS"
  fi
fi

# ── 6. HPA status ─────────────────────────────────────────────────────────────
step "HPA status"
HPA_OUTPUT=$(kubectl get hpa -n "$NAMESPACE" --no-headers 2>/dev/null || echo "")
if [ -z "$HPA_OUTPUT" ]; then
  info "No HPAs found — apply k8s/hpa.yaml first"
else
  echo "$HPA_OUTPUT" | while IFS= read -r line; do
    NAME=$(echo "$line"    | awk '{print $1}')
    TARGETS=$(echo "$line" | awk '{print $2}')
    MIN=$(echo "$line"     | awk '{print $3}')
    MAX=$(echo "$line"     | awk '{print $4}')
    REPLICAS=$(echo "$line"| awk '{print $5}')
    ok "$NAME  targets=$TARGETS  replicas=$REPLICAS (min=$MIN max=$MAX)"
  done
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}  All $PASS checks passed ✓${NC}"
else
  echo -e "${RED}  $FAIL failed, $PASS passed${NC}"
  echo ""
  echo "  Common fixes:"
  echo "    Pods crashing   → kubectl logs deployment/<name> -n $NAMESPACE"
  echo "    ImagePullError  → check ECR URL and IAM permissions on the node role"
  echo "    0/1 not ready   → check readiness probe path and port in deployment.yaml"
  echo "    401 everywhere  → SHARED_SECRET mismatch between auth and orders secrets"
  exit 1
fi
echo "═══════════════════════════════════════════"
echo ""