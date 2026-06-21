output "alb_sg_id" { value = aws_security_group.alb.id }
output "k3s_sg_id" { value = aws_security_group.k3s.id }
output "rds_sg_id" { value = aws_security_group.rds.id }
output "nat_sg_id" { value = aws_security_group.nat.id }
