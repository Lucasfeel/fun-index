grant usage on schema ops to service_role;
grant usage on schema app_public to service_role;
grant usage on schema admin to service_role;

grant select, insert, update on all tables in schema ops to service_role;
grant select, insert, update on all tables in schema app_public to service_role;
grant select, insert, update on all tables in schema admin to service_role;

grant usage, select on all sequences in schema ops to service_role;
grant usage, select on all sequences in schema app_public to service_role;
grant usage, select on all sequences in schema admin to service_role;

alter default privileges in schema ops
  grant select, insert, update on tables to service_role;
alter default privileges in schema app_public
  grant select, insert, update on tables to service_role;
alter default privileges in schema admin
  grant select, insert, update on tables to service_role;

alter role authenticator set pgrst.db_schemas = 'public,storage,graphql_public,app_public,ops,admin';
notify pgrst, 'reload config';
