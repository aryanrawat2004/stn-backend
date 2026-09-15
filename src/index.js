"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const employers_1 = __importDefault(require("./routes/employers"));
const candidates_1 = __importDefault(require("./routes/candidates"));
const jobs_1 = __importDefault(require("./routes/jobs"));
const activities_1 = __importDefault(require("./routes/activities"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/api/admin/employers", employers_1.default);
app.use("/api/admin/candidates", candidates_1.default);
app.use("/api/admin/jobs", jobs_1.default);
app.use("/api/admin/activities", activities_1.default);
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map