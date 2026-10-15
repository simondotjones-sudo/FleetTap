// Stable permission keys. Organisation labels are presentation only.
export const roleNames={platform_admin:'Platform Admin',organisation_admin:'Organisation Admin',garage_manager:'Garage Manager',supervisor:'Supervisor',mechanic:'Garage Staff'};
export const roleKeys=Object.keys(roleNames);
export const manager=u=>['platform_admin','organisation_admin','garage_manager'].includes(u?.role);
export const author=u=>['platform_admin','organisation_admin'].includes(u?.role);
export const reviewer=u=>manager(u)||u?.role==='supervisor';
export const roleLabel=(role,labels={})=>labels?.[role]||roleNames[role]||role;
export const assignableRoles=u=>u?.role==='platform_admin'?roleKeys:u?.role==='organisation_admin'?['garage_manager','supervisor','mechanic']:u?.role==='garage_manager'?['supervisor','mechanic']:[];
export const workerName=u=>u.name+' ('+(u.email||u.employee_id||u.id)+')';
