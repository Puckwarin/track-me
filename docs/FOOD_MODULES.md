# Food module structure

The food page remains available through `src/food.js`; existing imports such as `mountFood`, `watchDay`, `getPresets`, and `guessFoodCategory` remain compatible.

| Module | Responsibility |
|---|---|
| `src/food.js` | Page UI, form state, rendering, scanning flows, and food-log interactions |
| `src/foodConstants.js` | Built-in catalog, meal presentation constants, custom-food normalization, and preset selection |
| `src/foodCalculations.js` | Portion labels, legacy quantity handling, per-unit nutrition, and gram-to-unit conversion |
| `src/foodValidation.js` | Food-log and food-library form validation |
| `src/foodService.js` | Firestore access for food records, history queries, and custom-food CRUD |
| `src/foodParser.js` | Text/table parsing and food categorization |
| `src/foodEditor.js` | Custom-food editor and label-review modal |
| `src/foodHistory.js` | Food-history search modal |
| `src/foodsearch.js` | External food search integrations |
| `src/nutrition.js` | Nutrition lookup and AI image/label analysis |

`food.js` owns page-local state and passes current records or catalog presets to the pure calculation helpers. The service module does not import the page, avoiding a circular dependency. Historical records without `quantity`, records with a quantity embedded in the name, and older portion descriptions continue to be interpreted by `foodCalculations.js` and `foodConstants.js`.

Run the food unit tests with:

```sh
npm test -- --run src/food*.test.js
```
