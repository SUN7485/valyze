-- Phase 1.1: only Waleed and Sally remain admins; Mohamed, Mahmoud, Amani become analysts.
update app_users set role = 'analyst'
where email in ('mohamed@valyze.com', 'mahmoud@valyze.com', 'amani@valyze.com');
