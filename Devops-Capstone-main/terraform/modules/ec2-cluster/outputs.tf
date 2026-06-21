output "control_plane_instance_id"   { value = aws_instance.control_plane.id }
output "control_plane_private_ip"    { value = aws_instance.control_plane.private_ip }
output "worker_asg_name"             { value = aws_autoscaling_group.workers.name }
output "k3s_node_role_arn"           { value = aws_iam_role.k3s_node.arn }
