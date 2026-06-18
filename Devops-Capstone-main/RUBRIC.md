# Grading Rubric — 100 points + bonus

The application (`services/`, `frontend/`) is provided and working — it is
not graded on its own, but a broken app after containerization/deployment is
a deduction (see below).

## 1. Docker (15 pts)
- Working Dockerfile for each of the 4 components (auth, catalog, orders, frontend) (8 pts)
- Images are reasonably small / use multi-stage builds where it matters (frontend build vs. serve) (4 pts)
- A `docker-compose.yml` (student-authored) brings up all 4 components together correctly (3 pts)

## 2. Terraform / AWS (20 pts)
- Remote state (S3 + DynamoDB lock) configured correctly (2 pts)
- VPC module: public/private subnets across 2+ AZs, IGW, route tables correctly split public vs. private (3 pts)
- Security groups module: each SG (`alb-sg`, `k3s-sg`, `rds-sg`, `nat-sg`) opens only what the next layer needs — no `0.0.0.0/0` on anything but `alb-sg` (2 pts)
- NAT instance module provisioned and private subnets can actually reach the internet through it (e.g. pull a Docker image) (2 pts)
- k3s cluster provisioned on EC2 (control-plane + Auto Scaling Group of workers) via the `ec2-cluster` module, reachable with `kubectl get nodes` (4 pts)
- ALB module: target group attached to the ASG, routes traffic to the cluster NodePort (2 pts)
- RDS module: PostgreSQL instance provisioned in private subnets via a DB subnet group (2 pts)
- 4 ECR repositories created (one per component) and used by the pipeline (1 pt)
- IAM: GitHub OIDC role with least-privilege policy, **no static AWS keys in GitHub secrets** (1 pt)
- Code is organized into the 8 required modules, uses variables (not hardcoded values), root `main.tf` wires module outputs to module inputs correctly (1 pt)

## 3. SQLite → RDS Migration (10 pts)
- All 3 services connect to RDS PostgreSQL instead of local SQLite, driven by an env var (no hardcoded endpoint) (5 pts)
- Migration tested locally against a Postgres container before pointing at RDS (2 pts)
- Credentials delivered via Kubernetes Secret, never committed to git (2 pts)
- App still works end-to-end (auth → orders → catalog chain) after the migration (1 pt)

## 4. Kubernetes (20 pts)
- Deployment + Service for all 4 components running correctly on the k3s cluster, reachable through the ALB end-to-end (6 pts)
- Secrets used for `SHARED_SECRET` (same value on auth-service and orders-service) and RDS credentials — no plaintext secrets committed to git (4 pts)
- Ingress (Traefik) correctly routes `/`, `/api/auth`, `/api/products`, `/api/orders` to the right backend, exposed via a NodePort the ALB targets (4 pts)
- HPA configured on at least one service and demonstrably scales under load (3 pts)
- Readiness/liveness probes and resource requests/limits set on every container (3 pts)

## 5. CI/CD — GitHub Actions (20 pts)
- `ci.yml`: tests + builds + pushes all 4 images to their ECR repos on merge to main, via OIDC on GitHub-hosted runners (6 pts)
- `terraform.yml`: `plan` on PR, `apply` on merge, using OIDC auth (5 pts)
- `deploy.yml`: runs on the self-hosted runner registered on the control-plane instance, updates the cluster with new images for all 4 components, and verifies rollout (`kubectl rollout status`) (6 pts)
- End-to-end proof: a real code change pushed to `main` results in an automatic, verified deployment of the affected service(s) (3 pts)

## 6. Bash & Documentation (15 pts)
- `setup.sh`, `deploy.sh`, `healthcheck.sh`, `teardown.sh` all work as intended (8 pts)
- Scripts use `set -euo pipefail`, proper exit codes, clear output (2 pts)
- README/diagram updated to reflect the actual implementation (3 pts)
- Submission checklist items completed (live demo or recording + clean teardown) (2 pts)

## Bonus (up to +10 pts)
- Helm chart packaging of k8s manifests (+3)
- Monitoring (Prometheus/Grafana or CloudWatch Container Insights) (+3)
- Multi-environment setup (dev/staging) (+2)
- Blue/green or canary deploy strategy (+3)
- Multi-AZ RDS (instead of the free-tier single-AZ baseline) with a documented cost trade-off (+2)

*(Bonus capped at +10 total regardless of how many items are completed.)*

## Automatic deductions
- The provided application breaks (auth → orders → catalog call chain fails) after containerization/deployment or the RDS migration: -10
- AWS resources (especially EC2/RDS/ALB) left running for >24 hrs after submission without instructor notice: -5
- Static AWS credentials or DB passwords committed to git history: -10
- Pipeline fails when instructor re-runs it from a fresh clone: -10
- EKS, a managed NAT Gateway, or any non-free-tier service used without instructor approval (defeats the cost-discipline objective of this project): -5
