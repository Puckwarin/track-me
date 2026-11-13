// สถานะกลางของแอป + event bus อย่างง่าย
export const state = {
  user: null,
  uid: null,
  period: [],
  body: [],
  customFoods: [],
  symptoms: [],
  workouts: [],
  templates: [],
  labs: [],
  profile: null,
  skinRecords: [],
  skincareProducts: [],
  ingredientBlacklist: [],
  trackedProducts: [],
  replacements: [],
  petProfiles: [],
  petCare: [],
  petFoods: [],
  loaded: { period: false, body: false }
};
const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, e => fn(e.detail));
