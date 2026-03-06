"use strict";
/**
 * TOKE SELECTORS — Dealer Income & Expense Tracking (Multi-Day v2)
 * ═══════════════════════════════════════════════════════════════════
 * CRUD for toke_gigs, toke_gig_days, toke_downs, toke_expenses.
 * Each gig now contains multiple "days". Downs and expenses belong
 * to a specific day (via day_id). The event stays active across all
 * days until the user explicitly clicks "Complete Event".
 * ═══════════════════════════════════════════════════════════════════
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGigs = fetchGigs;
exports.getActiveGig = getActiveGig;
exports.createGig = createGig;
exports.updateGig = updateGig;
exports.completeGig = completeGig;
exports.completeGigWithMileage = completeGig;
exports.deleteGig = deleteGig;
exports.createDay = createDay;
exports.closeDay = closeDay;
exports.createDown = createDown;
exports.endDown = endDown;
exports.createDoubleDown = createDoubleDown;
exports.deleteDown = deleteDown;
exports.updateDownToke = updateDownToke;
exports.updateDownMultiplier = updateDownMultiplier;
exports.fetchExpenses = fetchExpenses;
exports.createExpense = createExpense;
exports.deleteExpense = deleteExpense;
exports.getGigReport = getGigReport;
exports.getTokeAnalytics = getTokeAnalytics;
var supabase_1 = require("../supabase");
// ─── Retry Utility — imported from shared module ────────
var retryUtils_1 = require("./retryUtils");
// ─── Helper: compute total hours from a list of downs ───────────────
function computeTotalHours(downs) {
    var ms = 0;
    for (var _i = 0, downs_1 = downs; _i < downs_1.length; _i++) {
        var d = downs_1[_i];
        var start = new Date(d.started_at).getTime();
        var end = d.ended_at ? new Date(d.ended_at).getTime() : Date.now();
        ms += end - start;
    }
    return ms / (1000 * 60 * 60);
}
// ─── Helper: decorate a day with computed fields ─────────────────────
function decorateDay(day, downs, expenses) {
    var dayDowns = downs.filter(function (d) { return d.day_id === day.id; });
    var dayExpenses = expenses.filter(function (e) { return e.day_id === day.id; });
    var dealingDowns = dayDowns.filter(function (d) { return d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush'; });
    return __assign(__assign({}, day), { downs: dayDowns, expenses: dayExpenses, totalTokes: dealingDowns.reduce(function (s, d) { return s + (d.toke_amount || 0); }, 0), totalDowns: dealingDowns.length, totalHoursWorked: computeTotalHours(dayDowns), totalExpenses: dayExpenses.reduce(function (s, e) { return s + (e.amount || 0); }, 0) });
}
// ─── GIG CRUD ────────────────────────────────────────────────────────
/**
 * Fetch all non-deleted gigs for a user (most recent first)
 */
function fetchGigs(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, retryUtils_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                    var _a, data, error, gigIds, _b, allDownsRaw, allExpsRaw, downsByGig, expsByGig, _i, _c, d, _d, _e, e;
                    return __generator(this, function (_f) {
                        switch (_f.label) {
                            case 0: return [4 /*yield*/, supabase_1.supabase
                                    .from('toke_gigs')
                                    .select('*')
                                    .eq('user_id', userId)
                                    .neq('status', 'deleted')
                                    .order('start_date', { ascending: false })];
                            case 1:
                                _a = _f.sent(), data = _a.data, error = _a.error;
                                if (error)
                                    throw error;
                                if (!data || data.length === 0)
                                    return [2 /*return*/, []];
                                gigIds = data.map(function (g) { return g.id; });
                                return [4 /*yield*/, Promise.all([
                                        supabase_1.supabase.from('toke_downs').select('*').in('gig_id', gigIds),
                                        supabase_1.supabase.from('toke_expenses').select('*').in('gig_id', gigIds), // full row needed for category breakdown
                                    ])];
                            case 2:
                                _b = _f.sent(), allDownsRaw = _b[0].data, allExpsRaw = _b[1].data;
                                downsByGig = new Map();
                                expsByGig = new Map();
                                for (_i = 0, _c = (allDownsRaw || []); _i < _c.length; _i++) {
                                    d = _c[_i];
                                    if (!downsByGig.has(d.gig_id))
                                        downsByGig.set(d.gig_id, []);
                                    downsByGig.get(d.gig_id).push(d);
                                }
                                for (_d = 0, _e = (allExpsRaw || []); _d < _e.length; _d++) {
                                    e = _e[_d];
                                    if (!expsByGig.has(e.gig_id))
                                        expsByGig.set(e.gig_id, []);
                                    expsByGig.get(e.gig_id).push(e);
                                }
                                return [2 /*return*/, data.map(function (gig) {
                                        var allDowns = downsByGig.get(gig.id) || [];
                                        var allExps = expsByGig.get(gig.id) || [];
                                        var dealingDowns = allDowns.filter(function (d) { return d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush'; });
                                        return __assign(__assign({}, gig), { totalTokes: dealingDowns.reduce(function (s, d) { return s + (d.toke_amount || 0); }, 0), totalDowns: dealingDowns.length, totalHoursWorked: computeTotalHours(allDowns), totalExpenses: allExps.reduce(function (s, e) { return s + (e.amount || 0); }, 0), downs: allDowns, expenses: allExps });
                                    })];
                        }
                    });
                }); })];
        });
    });
}
/**
 * Get the active gig with its full day/down/expense tree
 */
function getActiveGig(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, retryUtils_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                    var _a, data, error, daysRaw, downs, expenses, allDowns, allExpenses, days, dealingDowns;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0: return [4 /*yield*/, supabase_1.supabase
                                    .from('toke_gigs')
                                    .select('*')
                                    .eq('user_id', userId)
                                    .eq('status', 'active')
                                    .limit(1)
                                    .maybeSingle()];
                            case 1:
                                _a = _b.sent(), data = _a.data, error = _a.error;
                                if (error)
                                    throw error;
                                if (!data)
                                    return [2 /*return*/, null];
                                return [4 /*yield*/, supabase_1.supabase
                                        .from('toke_gig_days')
                                        .select('*')
                                        .eq('gig_id', data.id)
                                        .order('day_number', { ascending: true })];
                            case 2:
                                daysRaw = (_b.sent()).data;
                                return [4 /*yield*/, supabase_1.supabase
                                        .from('toke_downs')
                                        .select('*')
                                        .eq('gig_id', data.id)
                                        .order('started_at', { ascending: true })];
                            case 3:
                                downs = (_b.sent()).data;
                                return [4 /*yield*/, supabase_1.supabase
                                        .from('toke_expenses')
                                        .select('*')
                                        .eq('gig_id', data.id)
                                        .order('created_at', { ascending: false })];
                            case 4:
                                expenses = (_b.sent()).data;
                                allDowns = (downs || []);
                                allExpenses = (expenses || []);
                                days = (daysRaw || []).map(function (day) {
                                    return decorateDay(day, allDowns, allExpenses);
                                });
                                dealingDowns = allDowns.filter(function (d) { return d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush'; });
                                return [2 /*return*/, __assign(__assign({}, data), { days: days, totalTokes: dealingDowns.reduce(function (s, d) { return s + (d.toke_amount || 0); }, 0), totalDowns: dealingDowns.length, totalHoursWorked: computeTotalHours(allDowns), totalExpenses: allExpenses.reduce(function (s, e) { return s + (e.amount || 0); }, 0) })];
                        }
                    });
                }); })];
        });
    });
}
/**
 * Create a new gig AND auto-create Day 1
 */
function createGig(userId, gig) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, uuidRegex, safeLocationId, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getActiveGig(userId)];
                case 1:
                    existing = _b.sent();
                    if (existing)
                        throw new Error('You already have an active event. Complete or delete it first.');
                    uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    safeLocationId = gig.location_id && uuidRegex.test(gig.location_id) ? gig.location_id : null;
                    return [4 /*yield*/, supabase_1.supabase
                            .from('toke_gigs')
                            .insert({
                            user_id: userId,
                            venue_name: gig.venue_name,
                            venue_address: gig.venue_address || null,
                            location_id: safeLocationId,
                            venue_type: gig.venue_type || 'casino',
                            poker_venue_id: gig.poker_venue_id || null,
                            latitude: gig.latitude || null,
                            longitude: gig.longitude || null,
                            start_date: gig.start_date || new Date().toISOString().split('T')[0],
                            hourly_rate: gig.hourly_rate || 0,
                            notes: gig.notes || null,
                            status: 'active',
                        })
                            .select()
                            .single()];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    // Auto-create Day 1
                    return [4 /*yield*/, createDay(userId, data.id, 1)];
                case 3:
                    // Auto-create Day 1
                    _b.sent();
                    return [2 /*return*/, data];
            }
        });
    });
}
/**
 * Update editable gig fields
 */
function updateGig(userId, gigId, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_gigs')
                        .update({
                        venue_name: updates.venue_name,
                        venue_address: updates.venue_address,
                        hourly_rate: updates.hourly_rate,
                        notes: updates.notes,
                        updated_at: new Date().toISOString(),
                    })
                        .eq('user_id', userId)
                        .eq('id', gigId)
                        .select()
                        .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
/**
 * Complete an entire event — closes any open day + sets status to completed
 */
function completeGig(userId_1, gigId_1) {
    return __awaiter(this, arguments, void 0, function (userId, gigId, mileage) {
        var openDowns, now, _i, openDowns_1, d, openDays, now, _a, openDays_1, d, _b, data, error;
        if (mileage === void 0) { mileage = 0; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_downs')
                        .select('id')
                        .eq('gig_id', gigId)
                        .is('ended_at', null)];
                case 1:
                    openDowns = (_c.sent()).data;
                    if (!(openDowns === null || openDowns === void 0 ? void 0 : openDowns.length)) return [3 /*break*/, 5];
                    now = new Date().toISOString();
                    _i = 0, openDowns_1 = openDowns;
                    _c.label = 2;
                case 2:
                    if (!(_i < openDowns_1.length)) return [3 /*break*/, 5];
                    d = openDowns_1[_i];
                    return [4 /*yield*/, supabase_1.supabase.from('toke_downs').update({ ended_at: now }).eq('id', d.id)];
                case 3:
                    _c.sent();
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_gig_days')
                        .select('id')
                        .eq('gig_id', gigId)
                        .is('ended_at', null)];
                case 6:
                    openDays = (_c.sent()).data;
                    if (!(openDays === null || openDays === void 0 ? void 0 : openDays.length)) return [3 /*break*/, 10];
                    now = new Date().toISOString();
                    _a = 0, openDays_1 = openDays;
                    _c.label = 7;
                case 7:
                    if (!(_a < openDays_1.length)) return [3 /*break*/, 10];
                    d = openDays_1[_a];
                    return [4 /*yield*/, supabase_1.supabase.from('toke_gig_days').update({ ended_at: now }).eq('id', d.id)];
                case 8:
                    _c.sent();
                    _c.label = 9;
                case 9:
                    _a++;
                    return [3 /*break*/, 7];
                case 10: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_gigs')
                        .update({
                        status: 'completed',
                        end_date: new Date().toISOString().split('T')[0],
                        mileage: mileage || 0,
                        updated_at: new Date().toISOString(),
                    })
                        .eq('user_id', userId)
                        .eq('id', gigId)
                        .select()
                        .single()];
                case 11:
                    _b = _c.sent(), data = _b.data, error = _b.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
/**
 * Soft-delete a gig
 */
function deleteGig(userId, gigId) {
    return __awaiter(this, void 0, void 0, function () {
        var error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_gigs')
                        .update({ status: 'deleted', updated_at: new Date().toISOString() })
                        .eq('user_id', userId)
                        .eq('id', gigId)];
                case 1:
                    error = (_a.sent()).error;
                    if (error)
                        throw error;
                    return [2 /*return*/];
            }
        });
    });
}
// ─── DAY CRUD ────────────────────────────────────────────────────────
/**
 * Create a new day for a gig
 */
function createDay(userId, gigId, dayNumber) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_gig_days')
                        .insert({
                        gig_id: gigId,
                        user_id: userId,
                        day_number: dayNumber,
                        date: new Date().toISOString().split('T')[0],
                        started_at: new Date().toISOString(),
                    })
                        .select()
                        .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
/**
 * Close out the current day (set ended_at)
 */
function closeDay(dayId) {
    return __awaiter(this, void 0, void 0, function () {
        var openDowns, now, _i, openDowns_2, d, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_downs')
                        .select('id')
                        .eq('day_id', dayId)
                        .is('ended_at', null)];
                case 1:
                    openDowns = (_b.sent()).data;
                    if (!(openDowns === null || openDowns === void 0 ? void 0 : openDowns.length)) return [3 /*break*/, 5];
                    now = new Date().toISOString();
                    _i = 0, openDowns_2 = openDowns;
                    _b.label = 2;
                case 2:
                    if (!(_i < openDowns_2.length)) return [3 /*break*/, 5];
                    d = openDowns_2[_i];
                    return [4 /*yield*/, supabase_1.supabase.from('toke_downs').update({ ended_at: now }).eq('id', d.id)];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_gig_days')
                        .update({ ended_at: new Date().toISOString() })
                        .eq('id', dayId)
                        .select()
                        .single()];
                case 6:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
// ─── DOWN CRUD ───────────────────────────────────────────────────────
/**
 * Create a down inside a specific day
 */
function createDown(userId, gigId, dayId, down) {
    return __awaiter(this, void 0, void 0, function () {
        var openDowns, now, _i, openDowns_3, d, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_downs')
                        .select('id')
                        .eq('day_id', dayId)
                        .is('ended_at', null)];
                case 1:
                    openDowns = (_b.sent()).data;
                    if (!(openDowns === null || openDowns === void 0 ? void 0 : openDowns.length)) return [3 /*break*/, 5];
                    now = new Date().toISOString();
                    _i = 0, openDowns_3 = openDowns;
                    _b.label = 2;
                case 2:
                    if (!(_i < openDowns_3.length)) return [3 /*break*/, 5];
                    d = openDowns_3[_i];
                    return [4 /*yield*/, supabase_1.supabase.from('toke_downs').update({ ended_at: now }).eq('id', d.id)];
                case 3:
                    _b.sent();
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_downs')
                        .insert({
                        gig_id: gigId,
                        day_id: dayId,
                        user_id: userId,
                        down_type: down.down_type || 'cash',
                        game_type: down.game_type || null,
                        tournament_name: down.tournament_name || null,
                        table_number: down.table_number || null,
                        tournament_buyin: down.tournament_buyin || null,
                        started_at: new Date().toISOString(),
                        toke_amount: down.toke_amount || 0,
                        is_double_down: down.is_double_down || false,
                        down_multiplier: down.down_multiplier || 1.0,
                        notes: down.notes || null,
                    })
                        .select()
                        .single()];
                case 6:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
/**
 * End a currently-open down
 */
function endDown(downId, tokeAmount) {
    return __awaiter(this, void 0, void 0, function () {
        var updates, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    updates = { ended_at: new Date().toISOString() };
                    if (tokeAmount !== undefined)
                        updates.toke_amount = tokeAmount;
                    return [4 /*yield*/, supabase_1.supabase
                            .from('toke_downs')
                            .update(updates)
                            .eq('id', downId)
                            .select()
                            .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
/**
 * Double-down — clone the last down into the same day
 */
function createDoubleDown(userId, gigId, dayId, lastDown) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, createDown(userId, gigId, dayId, {
                    down_type: lastDown.down_type,
                    game_type: lastDown.game_type,
                    tournament_name: lastDown.tournament_name,
                    table_number: lastDown.table_number,
                    tournament_buyin: lastDown.tournament_buyin || null, // preserve buy-in for analysis continuity
                    is_double_down: true,
                })];
        });
    });
}
function deleteDown(downId) {
    return __awaiter(this, void 0, void 0, function () {
        var error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase.from('toke_downs').delete().eq('id', downId)];
                case 1:
                    error = (_a.sent()).error;
                    if (error)
                        throw error;
                    return [2 /*return*/];
            }
        });
    });
}
function updateDownToke(downId, tokeAmount) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_downs')
                        .update({ toke_amount: tokeAmount })
                        .eq('id', downId)
                        .select()
                        .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
function updateDownMultiplier(downId, multiplier) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_downs')
                        .update({ down_multiplier: multiplier })
                        .eq('id', downId)
                        .select()
                        .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
// ─── EXPENSE CRUD ────────────────────────────────────────────────────
function fetchExpenses(gigId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_expenses')
                        .select('*')
                        .eq('gig_id', gigId)
                        .order('created_at', { ascending: false })];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data || []];
            }
        });
    });
}
function createExpense(userId, gigId, dayId, expense) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_expenses')
                        .insert({
                        user_id: userId,
                        gig_id: gigId,
                        day_id: dayId,
                        category: expense.category || 'other',
                        amount: expense.amount || 0,
                        description: expense.description || null,
                        receipt_url: expense.receipt_url || null,
                    })
                        .select()
                        .single()];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data];
            }
        });
    });
}
function deleteExpense(expenseId) {
    return __awaiter(this, void 0, void 0, function () {
        var error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase.from('toke_expenses').delete().eq('id', expenseId)];
                case 1:
                    error = (_a.sent()).error;
                    if (error)
                        throw error;
                    return [2 /*return*/];
            }
        });
    });
}
// ─── GIG REPORT ──────────────────────────────────────────────────────
function getGigReport(userId, gigId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, gig, gigError, daysRaw, downsRaw, expensesRaw, allDowns, allExpenses, days, dealingDowns, cashDowns, tournamentDowns, brushDowns, breakDowns, doubleDowns, totalTokes, totalHoursWorked, totalExpenses, hourlyRate, hourlyPay, totalEarnings, startDate, endDate, durationDays;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('toke_gigs')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('id', gigId)
                        .single()];
                case 1:
                    _a = _b.sent(), gig = _a.data, gigError = _a.error;
                    if (gigError)
                        throw gigError;
                    return [4 /*yield*/, supabase_1.supabase
                            .from('toke_gig_days')
                            .select('*')
                            .eq('gig_id', gigId)
                            .order('day_number', { ascending: true })];
                case 2:
                    daysRaw = (_b.sent()).data;
                    return [4 /*yield*/, supabase_1.supabase
                            .from('toke_downs')
                            .select('*')
                            .eq('gig_id', gigId)
                            .order('started_at', { ascending: true })];
                case 3:
                    downsRaw = (_b.sent()).data;
                    return [4 /*yield*/, supabase_1.supabase
                            .from('toke_expenses')
                            .select('*')
                            .eq('gig_id', gigId)
                            .order('created_at', { ascending: false })];
                case 4:
                    expensesRaw = (_b.sent()).data;
                    allDowns = (downsRaw || []);
                    allExpenses = (expensesRaw || []);
                    days = (daysRaw || []).map(function (day) {
                        return decorateDay(day, allDowns, allExpenses);
                    });
                    dealingDowns = allDowns.filter(function (d) { return d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush'; });
                    cashDowns = allDowns.filter(function (d) { return d.down_type === 'cash'; });
                    tournamentDowns = allDowns.filter(function (d) { return d.down_type === 'tournament'; });
                    brushDowns = allDowns.filter(function (d) { return d.down_type === 'brush'; });
                    breakDowns = allDowns.filter(function (d) { return d.down_type === 'break'; });
                    doubleDowns = allDowns.filter(function (d) { return d.is_double_down; });
                    totalTokes = dealingDowns.reduce(function (s, d) { return s + (d.toke_amount || 0); }, 0);
                    totalHoursWorked = computeTotalHours(allDowns);
                    totalExpenses = allExpenses.reduce(function (s, e) { return s + (e.amount || 0); }, 0);
                    hourlyRate = gig.hourly_rate || 0;
                    hourlyPay = totalHoursWorked * hourlyRate;
                    totalEarnings = hourlyPay + totalTokes - totalExpenses;
                    startDate = new Date(gig.start_date);
                    endDate = gig.end_date ? new Date(gig.end_date) : new Date();
                    durationDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
                    return [2 /*return*/, {
                            gig: gig,
                            days: days,
                            downs: allDowns,
                            expenses: allExpenses,
                            stats: {
                                totalTokes: totalTokes,
                                totalDowns: dealingDowns.length,
                                totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
                                hourlyRate: hourlyRate,
                                hourlyPay: Math.round(hourlyPay * 100) / 100,
                                totalEarnings: Math.round(totalEarnings * 100) / 100,
                                totalExpenses: Math.round(totalExpenses * 100) / 100,
                                cashDownCount: cashDowns.length,
                                tournamentDownCount: tournamentDowns.length,
                                brushDownCount: brushDowns.length,
                                breakCount: breakDowns.length,
                                doubleDownCount: doubleDowns.length,
                                avgTokePerDown: dealingDowns.length > 0 ? Math.round((totalTokes / dealingDowns.length) * 100) / 100 : 0,
                                durationDays: durationDays,
                                perDay: durationDays > 0 ? Math.round(totalEarnings / durationDays) : 0,
                            },
                        }];
            }
        });
    });
}
/**
 * Career-level analytics for the Toke Dashboard.
 * Uses the already-efficient bulk gig data to avoid extra queries.
 */
function getTokeAnalytics(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            return [2 /*return*/, (0, retryUtils_1.withRetry)(function () { return __awaiter(_this, void 0, void 0, function () {
                    var _a, gigs, gigErr, gigIds, _b, downsRaw, expsRaw, allDowns, allExps, downsByGig, expsByGig, _i, allDowns_1, d, _c, allExps_1, e, careerTokes, totalHours, totalExpenses, totalDealingDowns, downTypes, bestEvent, cumulative, eventTrend, monthlyMap, completedGigs, _d, completedGigs_1, gig, gigDowns, gigDealing, gigTokes, gigHours, gigExpenses, _e, gigDowns_1, d, monthKey, existing, monthlyTrend, now, i, d, key, label, val;
                    return __generator(this, function (_f) {
                        switch (_f.label) {
                            case 0: return [4 /*yield*/, supabase_1.supabase
                                    .from('toke_gigs')
                                    .select('id, venue_name, start_date, end_date, hourly_rate, status')
                                    .eq('user_id', userId)
                                    .neq('status', 'deleted')
                                    .order('start_date', { ascending: true })];
                            case 1:
                                _a = _f.sent(), gigs = _a.data, gigErr = _a.error;
                                if (gigErr)
                                    throw gigErr;
                                if (!gigs || gigs.length === 0) {
                                    return [2 /*return*/, {
                                            careerTokes: 0, totalEvents: 0, totalHours: 0, totalExpenses: 0,
                                            avgTokePerDown: 0, avgHoursPerEvent: 0, bestEvent: null,
                                            eventTrend: [], downTypes: { cash: 0, tournament: 0, brush: 0, break: 0 },
                                            monthlyTrend: [],
                                        }];
                                }
                                gigIds = gigs.map(function (g) { return g.id; });
                                return [4 /*yield*/, Promise.all([
                                        supabase_1.supabase.from('toke_downs').select('*').in('gig_id', gigIds),
                                        supabase_1.supabase.from('toke_expenses').select('gig_id, amount').in('gig_id', gigIds),
                                    ])];
                            case 2:
                                _b = _f.sent(), downsRaw = _b[0].data, expsRaw = _b[1].data;
                                allDowns = (downsRaw || []);
                                allExps = (expsRaw || []);
                                downsByGig = new Map();
                                expsByGig = new Map();
                                for (_i = 0, allDowns_1 = allDowns; _i < allDowns_1.length; _i++) {
                                    d = allDowns_1[_i];
                                    if (!downsByGig.has(d.gig_id))
                                        downsByGig.set(d.gig_id, []);
                                    downsByGig.get(d.gig_id).push(d);
                                }
                                for (_c = 0, allExps_1 = allExps; _c < allExps_1.length; _c++) {
                                    e = allExps_1[_c];
                                    expsByGig.set(e.gig_id, (expsByGig.get(e.gig_id) || 0) + (e.amount || 0));
                                }
                                careerTokes = 0;
                                totalHours = 0;
                                totalExpenses = 0;
                                totalDealingDowns = 0;
                                downTypes = { cash: 0, tournament: 0, brush: 0, break: 0 };
                                bestEvent = null;
                                cumulative = 0;
                                eventTrend = [];
                                monthlyMap = new Map();
                                completedGigs = gigs.filter(function (g) { return g.status === 'completed'; });
                                for (_d = 0, completedGigs_1 = completedGigs; _d < completedGigs_1.length; _d++) {
                                    gig = completedGigs_1[_d];
                                    gigDowns = downsByGig.get(gig.id) || [];
                                    gigDealing = gigDowns.filter(function (d) { return d.down_type === 'cash' || d.down_type === 'tournament' || d.down_type === 'brush'; });
                                    gigTokes = gigDealing.reduce(function (s, d) { return s + (d.toke_amount || 0); }, 0);
                                    gigHours = computeTotalHours(gigDowns);
                                    gigExpenses = expsByGig.get(gig.id) || 0;
                                    careerTokes += gigTokes;
                                    totalHours += gigHours;
                                    totalExpenses += gigExpenses;
                                    totalDealingDowns += gigDealing.length;
                                    for (_e = 0, gigDowns_1 = gigDowns; _e < gigDowns_1.length; _e++) {
                                        d = gigDowns_1[_e];
                                        if (d.down_type === 'cash')
                                            downTypes.cash++;
                                        else if (d.down_type === 'tournament')
                                            downTypes.tournament++;
                                        else if (d.down_type === 'brush')
                                            downTypes.brush++;
                                        else if (d.down_type === 'break')
                                            downTypes.break++;
                                    }
                                    if (!bestEvent || gigTokes > bestEvent.tokes) {
                                        bestEvent = { venueName: gig.venue_name, tokes: gigTokes, date: gig.start_date };
                                    }
                                    cumulative += gigTokes;
                                    eventTrend.push({
                                        date: gig.start_date,
                                        tokes: gigTokes,
                                        hours: Math.round(gigHours * 10) / 10,
                                        venue: gig.venue_name,
                                        cumulative: cumulative,
                                    });
                                    monthKey = gig.start_date.slice(0, 7);
                                    existing = monthlyMap.get(monthKey) || { tokes: 0, events: 0 };
                                    monthlyMap.set(monthKey, { tokes: existing.tokes + gigTokes, events: existing.events + 1 });
                                }
                                monthlyTrend = [];
                                now = new Date();
                                for (i = 11; i >= 0; i--) {
                                    d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                    key = "".concat(d.getFullYear(), "-").concat(String(d.getMonth() + 1).padStart(2, '0'));
                                    label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                                    val = monthlyMap.get(key) || { tokes: 0, events: 0 };
                                    monthlyTrend.push(__assign({ month: label }, val));
                                }
                                return [2 /*return*/, {
                                        careerTokes: careerTokes,
                                        totalEvents: completedGigs.length,
                                        totalHours: Math.round(totalHours * 10) / 10,
                                        totalExpenses: Math.round(totalExpenses * 100) / 100,
                                        avgTokePerDown: totalDealingDowns > 0 ? Math.round((careerTokes / totalDealingDowns) * 100) / 100 : 0,
                                        avgHoursPerEvent: completedGigs.length > 0 ? Math.round((totalHours / completedGigs.length) * 10) / 10 : 0,
                                        bestEvent: bestEvent,
                                        eventTrend: eventTrend,
                                        downTypes: downTypes,
                                        monthlyTrend: monthlyTrend,
                                    }];
                        }
                    });
                }); })];
        });
    });
}
