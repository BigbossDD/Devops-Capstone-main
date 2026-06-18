# DevOps Capstone Project — Full Brief

## 1. Overview

This capstone has two parts with very different starting points:

- **The application** (`services/` + `frontend/`) is **fully built and working**.
  It's a small e-commerce app split into three independent microservices plus a
  React frontend. Students do not need to write any application code.
- **Everything else** — Terraform, Kubernetes manifests, GitHub Actions
  pipelines, Docker, and Bash automation — is **deliberately empty**. The
  directory structure and filenames exist as a map of what's expected, but the
  files contain nothing. Building all of that, from scratch, around the
  provided application, is the actual assignment.

There is no managed Kubernetes service here. You provision plain EC2
instances with Terraform and turn them into a Kubernetes cluster yourselves
using `k3s` — harder than clicking "create EKS cluster," and it's how you
actually learn what a control plane, a node, and a load balancer integration
are doing. The full reasoning and diagram are in `docs/aws-architecture.png`
and the root `README.md`.

**Duration:** 1–2 weeks (10 working days, see Milestones below)
**Level:** Intermediate (students should already know Linux basics, Docker basics, and have an AWS account)

## 2. Learning Objectives

By the end of this project, students will be able to:

- Containerize multiple independent services with their own Dockerfiles, and compose them for local development
- Write Terraform, organized into modules, to provision a VPC, a self-managed k3s cluster on EC2 (control-plane + Auto Scaling Group of workers), a NAT instance, an Application Load Balancer, RDS PostgreSQL, ECR repositories per service, and an IAM role for GitHub OIDC (no static AWS keys)
- Explain and correctly configure core AWS networking/compute primitives: VPC, public/private subnets, Internet Gateway, NAT, route tables, security groups, EC2, Auto Scaling, Load Balancing, and RDS
- Write Kubernetes manifests from scratch for a multi-service app: Deployments, Services, ConfigMaps/Secrets, Ingress routing to multiple backends, HPA, probes, resource limits
- Build a GitHub Actions pipeline from scratch that tests, builds, and pushes 4 separate images, provisions infra via OIDC, and deploys all 4 components using a self-hosted runner on the cluster
- Write Bash automation for setup, deploy, health-checking, and teardown
- Reason about microservice boundaries: independent data stores, service-to-service calls, shared-secret JWT verification across services
- Diagnose and fix a real distributed-systems failure mode: migrating each service off SQLite to a shared RDS Postgres database once horizontal scaling makes local file-based storage incorrect

## 3. The Application (provided, already working)

### Application architecture (local / pre-AWS)

```
                    ┌─────────────┐
                    │  frontend   │  React (Vite), :5173
                    │ (provided)  │
                    └──────┬──────┘
            ┌──────────────┼──────────────┐
            ▼               ▼               ▼
     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
     │auth-service │ │catalog-     │ │orders-      │
     │  :5001      │ │ service     │ │ service     │
     │ SQLite      │ │  :5002      │ │  :5003      │
     │ (users)     │ │ SQLite      │ │ SQLite      │
     │             │ │ (products)  │ │ (orders)    │
     └─────────────┘ └──────▲──────┘ └──────┬──────┘
                             │  HTTP (verify product/price)
                             └────────────────┘
```

This is the starting point you run locally on day 1. The full target AWS
deployment — k3s on EC2, ALB, RDS replacing SQLite, ECR, GitHub Actions — is
in `docs/aws-architecture.png` and the root `README.md`. Don't confuse the
two: this diagram is "the app today," not "the project's final state."

- **auth-service** — register/login, issues JWTs (HS256, shared secret), `/api/auth/me`
- **catalog-service** — product catalog (seeded with sample data), public read endpoints
- **orders-service** — verifies the caller's JWT locally (no network call to auth-service needed),
  then calls catalog-service over HTTP for every line item to get the authoritative price/stock
  before creating an order. This is the inter-service communication pattern to study.
- **frontend** — React SPA: catalog browsing, cart, checkout, login/register, order history

Each service owns its own SQLite database file and is independently runnable
with nothing but Python — see each `services/*/README.md` for exact run
instructions. The frontend has its own `README.md` too.

### Run it locally right now (no Docker, no AWS, no Kubernetes)

```bash
# Terminal 1
cd services/auth-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py
# Terminal 2
cd services/catalog-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py
# Terminal 3
cd services/orders-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py
# Terminal 4
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`. Confirm this works before touching anything else —
it's your baseline for "did my Docker/K8s/CI-CD setup break the app."

## 4. What Students Build (everything currently empty)

### `services/*/Dockerfile` and `frontend/Dockerfile` (4 files, all empty)
Write a Dockerfile for each of the 4 components. Each service is a standalone
Python app — keep images small and multi-stage where useful. The frontend
needs a build stage (Vite build) and a serve stage (e.g. Nginx).

### `terraform/` (modules skeleton, all files empty)
Root files (`main.tf`, `variables.tf`, `outputs.tf`, `providers.tf`,
`versions.tf`, `backend.tf`, `terraform.tfvars.example`) wire together 8
modules under `terraform/modules/`. Build them bottom-up — see README §5.3
for the exact dependency order:

- `modules/vpc` — VPC, public/private subnets across 2 AZs, Internet Gateway, route tables
- `modules/security-groups` — `alb-sg`, `k3s-sg`, `rds-sg`, `nat-sg`
- `modules/nat-instance` — EC2 NAT instance (replaces a paid NAT Gateway)
- `modules/ec2-cluster` — k3s control-plane EC2 instance + Auto Scaling Group of workers, bootstrapped via the `.sh.tpl` user-data templates in `modules/ec2-cluster/templates/`
- `modules/rds` — PostgreSQL (`db.t3.micro`) + subnet group
- `modules/alb` — Application Load Balancer + target group attached to the ASG
- `modules/ecr` — one repository per service (4 total: auth, catalog, orders, frontend)
- `modules/iam-oidc` — GitHub OIDC provider + least-privilege IAM role, no static AWS keys anywhere

### `k8s/` (empty, organized per-service)
```
k8s/
  namespace.yaml
  ingress.yaml          route /, /api/auth, /api/products, /api/orders to the right service
  hpa.yaml               at least one HPA (e.g. on orders-service or catalog-service)
  auth-service/      deployment.yaml, service.yaml, secret.yaml (SHARED_SECRET)
  catalog-service/   deployment.yaml, service.yaml
  orders-service/    deployment.yaml, service.yaml, secret.yaml (SHARED_SECRET — must match auth-service's)
  frontend/          deployment.yaml, service.yaml
```
Every Deployment needs readiness/liveness probes (`/health` on each backend
service) and resource requests/limits. `auth-service` and `orders-service`
must share the same `SHARED_SECRET` value or JWT verification will fail
across services — that's intentional, it's the point of the exercise.

### `.github/workflows/` (3 empty workflow files)
- `ci.yml` — on PR and push: test each service, build all 4 images, push to their ECR repos (main only), via GitHub-hosted runners + OIDC
- `terraform.yml` — `terraform plan` on PR, `terraform apply` on merge to main, both via GitHub OIDC
- `deploy.yml` — runs on a **self-hosted runner registered on the k3s control-plane instance**; applies manifests with the new image tags and verifies rollout for all 4 deployments

### `scripts/` (4 empty Bash scripts)
- `setup.sh` — verify required CLI tools are installed
- `deploy.sh` — local helper: terraform apply + kubectl apply, for testing before wiring up CI
- `healthcheck.sh` — curl `/health` on all 3 backend services (port-forward or direct), check pod status
- `teardown.sh` — `terraform destroy` with a confirmation prompt

### SQLite → RDS migration (required, not optional)
The provided services use local SQLite files. That breaks once you have
multiple k3s workers running multiple replicas — each one gets a divergent,
disconnected copy of the data. Migrating each service's storage layer to the
RDS PostgreSQL instance from `modules/rds` is a required part of this
project, not a bonus. See README §5.6 for the exact steps.

## 5. Bonus / Stretch Goals (up to +10 pts)

- Package the k8s manifests as a Helm chart
- Add Prometheus + Grafana or CloudWatch Container Insights
- Multi-environment support (dev/staging)
- Add an API gateway / single ingress entry point instead of routing by path manually
- Blue/green or canary deploy strategy in the CD workflow

## 6. Suggested Milestones (10 working days)

| Day | Focus |
|---|---|
| 1 | Run the app locally (no Docker). Read all 4 services' code and READMEs until the auth → orders → catalog call chain makes sense |
| 2 | Write all 4 Dockerfiles; confirm each image runs standalone; write a docker-compose for local multi-container testing, including a local Postgres container |
| 3 | Migrate all 3 services from SQLite to PostgreSQL, tested locally against the Compose Postgres container |
| 4 | Terraform: remote state bootstrap, `modules/vpc`, `modules/security-groups`, `modules/nat-instance` |
| 5 | Terraform: `modules/ec2-cluster` (k3s control-plane + worker ASG), `modules/rds`, `modules/ecr`. Confirm `kubectl get nodes` works via SSM before writing any YAML |
| 6 | Write k8s manifests for auth-service and catalog-service; deploy manually with `kubectl apply`, verify with `kubectl logs`/`port-forward` |
| 7 | Write k8s manifests for orders-service and frontend; add Ingress + `modules/alb`; verify the full call chain works end-to-end through the ALB |
| 8 | Add HPA, probes, resource limits to all 4 Deployments; finish `modules/iam-oidc` |
| 9 | GitHub Actions: `ci.yml`, `terraform.yml`, and `deploy.yml` (register the self-hosted runner on the control-plane instance first) |
| 10 | Write the 4 Bash scripts, polish docs/diagram, demo, `teardown.sh`, submit |

## 7. Submission Checklist

- [ ] Repo with full commit history (not a single commit)
- [ ] All 4 Dockerfiles build and run
- [ ] All 3 backend services migrated from SQLite to RDS PostgreSQL
- [ ] Terraform provisions cleanly from a fresh `terraform apply`, modules wired together correctly
- [ ] k3s cluster running on EC2 (control-plane + ASG workers), all 4 services + frontend deployed and reachable via the ALB
- [ ] CI/CD pipeline proven end-to-end: a real code change on `main` results in an automatic, verified deployment via the self-hosted runner
- [ ] No static AWS credentials anywhere in GitHub secrets (OIDC only)
- [ ] Architecture diagram reflecting the actual implementation (see `docs/`)
- [ ] Short write-up: one thing that broke and how it was debugged
- [ ] `teardown.sh` run before submission (or a recorded demo if a live demo isn't feasible)

## 8. Cost Note for Students

This architecture is designed to be free or near-free under the AWS Free
Tier (first 12 months of a new account): EC2 t3.micro (750 hrs/month), RDS
db.t3.micro (750 hrs/month + 20GB), and the ALB (750 hrs/month) all fall
within free-tier limits, and the NAT instance/self-managed k3s avoid the
ongoing NAT Gateway and EKS control-plane fees entirely. It is **not** free
if you leave it running continuously across a multi-week project. Set up an
AWS Budget alarm before provisioning anything, and run
`scripts/teardown.sh` at the end of every work session — only RDS storage
and S3 keep costing anything (cents) while torn down.
