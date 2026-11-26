# Food module structure

The food page remains available through `src/food.js`; existing imports such as `mountFood`, `watchDay`, `getPresets`, and `guessFoodCategory` remain compatible.

| Module | Responsibility |
|---|---|
| `src/food.js` | Page UI with Home-aligned `.hx-hero` summary (4 macros: Protein, Carbs, Fat, Sugar · Sodium + target-scaled DonutChart + responsive side-by-side `#f-advice`), date picker + `#f-week-strip` (`showArrows: false`), `#f-fav-strip` quick favorites, smart quantity entry (`inferFoodInputMode`), separated barcode & nutrition-label scan buttons with temporary client-side image preview, collapsible meal groups (`collapsedMeals`), mobile swipe / desktop `.tm-row-action-btn` inline actions / drag-and-drop food-log interactions, library modal (`openLibrary` with bulk add/category lock), and custom-food edit sync |
| `src/foodConstants.js` | Built-in catalog, meal presentation constants, custom-food normalization, and preset selection |
| `src/foodCalculations.js` | Portion labels, legacy quantity handling, per-unit nutrition, smart unit/gram auto-inference (`inferFoodInputMode`, `foodQuantityFromInput`), meal calorie pie data (`buildMealCaloriePieData` with Cool Sky Blue & Navy `MEAL_PIE_PALETTE` and protein), multi-factor advice (`buildFoodAdvice`), and custom-food sync helpers |
| `src/foodValidation.js` | Food-log and food-library form validation |
| `src/foodService.js` | Firestore access for food records, history queries, and custom-food CRUD |
| `src/foodParser.js` | Text/table parsing and food categorization |
| `src/foodEditor.js` | Responsive 2-column custom-food editor and label-review modal with star favorite toggle (`#e-fav`), `"คาร์บ (g)"` label, `accent-brand` confirmation checkbox, and selective missing-field warnings |
| `src/foodHistory.js` | Food-history search modal with `#fh-range`, scrollable `#fh-week-strip`, debounced auto-search, collapsible day & meal groups (with collapse/expand all), and grouped copy-meal / copy-item actions |
| `src/foodsearch.js` | External food search integrations with responsive 2-column results + portion calculator modal |
| `src/nutrition.js` | Nutrition lookup and AI image/label analysis |

`food.js` owns page-local state and passes current records or catalog presets to the pure calculation helpers. When a custom food in `custom_foods` is edited, `food.js` uses `buildFoodRecordUpdatesFromLibrary()` and `matchesLibraryFoodRecord()` in `foodCalculations.js` to refresh the active form base (preserving current quantity inputs) and update matching `food_records` for the active date. When meals are renamed in `src/profile.js`, `food_records` matching the `mealId` or previous meal name are batch-synced in Firestore. The service module does not import the page, avoiding a circular dependency. Historical records without `quantity`, records with a quantity embedded in the name, and older portion descriptions continue to be interpreted by `foodCalculations.js` and `foodConstants.js`.

Run the food unit tests with:

```sh
npm test -- --run src/food*.test.js
```
