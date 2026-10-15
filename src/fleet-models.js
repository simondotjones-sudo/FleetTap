// Catalogue transcribed from Simon's supplied workbook, 15 October 2026.
// Combined source rows are split by fleet prefix so different classes can have their own schedule.
// Descriptions are reference data, not approval of a maintenance template for a vehicle.
const groups = [
 ['AX','Alexander Dennis Enviro500 / Volvo B7TL','Diesel (Standard Double-Deck)','2005 – 2006 (Phasing out)'],
 ['EV / EA','Alexander Dennis Enviro400','Diesel (Standard Double-Deck)','2007 – 2008 / 2024 (EA variant)'],
 ['VG / VT','Volvo B9TL / Wrightbus Gemini 2','Diesel (Standard Double-Deck)','2008 – 2011'],
 ['GT','Volvo B5TL / Wrightbus Gemini 3 (Lite)','Diesel (Lighter Urban Double-Deck)','2012 – 2016'],
 ['SG','Volvo B5TL / Wrightbus Gemini 3','Diesel (Standard High-Capacity Double-Deck)','2017 – 2020'],
 ['AH','Volvo B5LH / Wrightbus Gemini 3','Diesel-Electric Hybrid Double-Deck','2019 (Trial batches)'],
 ['PA','Alexander Dennis Enviro400MMC / ER','Diesel & Diesel-Electric Hybrid','2019 – Present'],
 ['WS / EW / WH','Wrightbus StreetDeck (Electroliner / FCEV / Micro-Hybrid)','Battery-Electric, Hydrogen Fuel Cell, & Low-Emission Diesel','2021 – Present (Current backbone of fleet modernization)']
];
export const fleetModels = groups.flatMap(([series,name,technology,years])=>series.split(' / ').map(id=>({id,name,technology,years,series})));
export const fleetModel = id=>fleetModels.find(m=>m.id===id);
export function vehicleModelType(vehicle){
 if(Object.hasOwn(vehicle,'modelType'))return fleetModel(vehicle.modelType)?.id||'';
 for(const value of [vehicle.id,vehicle.model]){
  const prefix=String(value||'').trim().toUpperCase().match(/^([A-Z]+)(?=[\s\d+\-/]|$)/)?.[1];
  if(fleetModel(prefix))return prefix;
 }
 return '';
}
export function modelTypeForSave(values){
 if(values.modelType===undefined)return vehicleModelType(values);
 if(values.modelType!==''&&!fleetModel(values.modelType))throw Error('Choose a model type from the catalogue or Other model.');
 return values.modelType;
}
