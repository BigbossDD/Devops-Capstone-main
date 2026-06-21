resource "aws_lb" "main" {
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnet_ids

  tags = { Name = "${var.project_name}-alb" }
}

# Target group points at the NodePort Traefik exposes on every k3s node.
# Type "instance" + the ASG attachment means new worker nodes auto-register.
resource "aws_lb_target_group" "k3s" {
  name        = "${var.project_name}-k3s-tg"
  port        = var.traefik_nodeport
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    path                = "/health"     # Traefik liveness — falls back to / if no /health
    protocol            = "HTTP"
    port                = var.traefik_nodeport
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 5
    matcher             = "200-399"
  }

  tags = { Name = "${var.project_name}-k3s-tg" }
}

# HTTP listener — forwards all traffic to k3s target group
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.k3s.arn
  }
}
