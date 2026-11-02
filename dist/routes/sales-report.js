"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.salesReportRouter = void 0;
const express_1 = __importDefault(require("express"));
const sales_report_1 = require("../modules/sales-report");
const timezone_1 = require("../utils/timezone");
exports.salesReportRouter = express_1.default.Router();
const monthOf = (v) => (0, timezone_1.resolveMonthKey)(typeof v === 'string' ? v : undefined);
exports.salesReportRouter.get('/', async (req, res) => {
    var _a;
    try {
        res.json(Object.assign({ success: true }, (await (0, sales_report_1.salesReport)(monthOf(req.query.month)))));
    }
    catch (error) {
        console.error('Error building sales report:', error);
        res.status(400).json({ success: false, message: (_a = error.message) !== null && _a !== void 0 ? _a : 'Could not build the report' });
    }
});
exports.salesReportRouter.get('/export', async (req, res) => {
    var _a;
    try {
        const report = await (0, sales_report_1.salesReport)(monthOf(req.query.month));
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="lunaa-sales-report-${report.month}.xlsx"`);
        res.status(200).send((0, sales_report_1.reportXlsx)(report));
    }
    catch (error) {
        console.error('Error exporting sales report:', error);
        res.status(400).json({ success: false, message: (_a = error.message) !== null && _a !== void 0 ? _a : 'Could not build the report' });
    }
});
// { month: 'YYYY-MM', target: number | null }
exports.salesReportRouter.put('/target', async (req, res) => {
    var _a, _b, _c;
    try {
        const month = (_a = req.body) === null || _a === void 0 ? void 0 : _a.month;
        if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month))
            throw new Error('Pick a month');
        const raw = (_b = req.body) === null || _b === void 0 ? void 0 : _b.target;
        const target = raw === null || raw === '' || raw === undefined ? null : Number(raw);
        if (target != null && (!Number.isFinite(target) || target < 0 || target > 100000000)) {
            throw new Error('Enter a target in ringgit');
        }
        await (0, sales_report_1.setTarget)(month, target);
        res.json(Object.assign({ success: true }, (await (0, sales_report_1.salesReport)(month))));
    }
    catch (error) {
        res.status(400).json({ success: false, message: (_c = error.message) !== null && _c !== void 0 ? _c : 'Could not save the target' });
    }
});
