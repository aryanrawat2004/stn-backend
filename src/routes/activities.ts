import { store } from "../store";
import { createCrudRouter } from "./crud";

export default createCrudRouter(store.activities, {
  prefix: "ACT",
  entityName: "Activity",
  table: "activities",
  required: ["type", "title", "description"],
});
