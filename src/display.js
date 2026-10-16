export function displayDate(value,fallback='Not recorded'){
 if(!value||!/^\d{4}-\d{2}-\d{2}/.test(value))return fallback;
 return new Date(value.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-IE',{day:'numeric',month:'short',year:'numeric'});
}
export function coveredThrough(end){if(!end)return 'Unknown';const d=new Date(end+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return displayDate(d.toISOString());}
