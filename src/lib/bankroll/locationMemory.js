"use strict";
/**
 * LOCATION MEMORY ENGINE
 * Tracks and remembers performance at specific venues
 */
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
exports.getOrCreateLocation = getOrCreateLocation;
exports.getUserLocations = getUserLocations;
exports.renameLocation = renameLocation;
exports.deleteLocation = deleteLocation;
exports.getLocationStats = getLocationStats;
exports.getLocationAlerts = getLocationAlerts;
exports.getStakePerformanceAtLocation = getStakePerformanceAtLocation;
exports.storeLocationMemory = storeLocationMemory;
exports.getLocationMemories = getLocationMemories;
exports.detectNearbyLocation = detectNearbyLocation;
var supabase_1 = require("../supabase");
/**
 * Get or create a location
 */
function getOrCreateLocation(userId_1, name_1) {
    return __awaiter(this, arguments, void 0, function (userId, name, venueType, latitude, longitude, pokerVenueId) {
        var session, authUserId, existing, insertData, _a, newLoc, error;
        var _b;
        if (venueType === void 0) { venueType = 'casino'; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase.auth.getSession()];
                case 1:
                    session = (_c.sent()).data.session;
                    authUserId = ((_b = session === null || session === void 0 ? void 0 : session.user) === null || _b === void 0 ? void 0 : _b.id) || userId;
                    return [4 /*yield*/, supabase_1.supabase
                            .from('bankroll_locations')
                            .select('id')
                            .eq('user_id', authUserId)
                            .ilike('name', name)
                            .limit(1)
                            .maybeSingle()];
                case 2:
                    existing = (_c.sent()).data;
                    if (existing)
                        return [2 /*return*/, existing.id];
                    insertData = {
                        user_id: authUserId,
                        name: name,
                        venue_type: venueType,
                        latitude: latitude,
                        longitude: longitude,
                    };
                    if (pokerVenueId) {
                        insertData.poker_venue_id = pokerVenueId;
                    }
                    return [4 /*yield*/, supabase_1.supabase
                            .from('bankroll_locations')
                            .insert(insertData)
                            .select('id')
                            .maybeSingle()];
                case 3:
                    _a = _c.sent(), newLoc = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, newLoc.id];
            }
        });
    });
}
/**
 * Get all locations for a user
 */
function getUserLocations(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('bankroll_locations')
                        .select('id, name')
                        .eq('user_id', userId)
                        .order('name')];
                case 1:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, data || []];
            }
        });
    });
}
/**
 * Rename a location
 */
function renameLocation(userId, locationId, newName) {
    return __awaiter(this, void 0, void 0, function () {
        var error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('bankroll_locations')
                        .update({ name: newName })
                        .eq('id', locationId)
                        .eq('user_id', userId)];
                case 1:
                    error = (_a.sent()).error;
                    if (error)
                        throw error;
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Delete a location (unlinks ledger entries but doesn't delete them)
 */
function deleteLocation(userId, locationId) {
    return __awaiter(this, void 0, void 0, function () {
        var unlinkErr, memErr, error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('bankroll_ledger')
                        .update({ location_id: null })
                        .eq('user_id', userId)
                        .eq('location_id', locationId)];
                case 1:
                    unlinkErr = (_a.sent()).error;
                    if (unlinkErr) {
                        console.warn('[deleteLocation] Failed to unlink ledger entries, continuing:', unlinkErr.message);
                    }
                    return [4 /*yield*/, supabase_1.supabase
                            .from('bankroll_assistant_memory')
                            .delete()
                            .eq('user_id', userId)
                            .eq('location_id', locationId)];
                case 2:
                    memErr = (_a.sent()).error;
                    if (memErr) {
                        console.warn('[deleteLocation] Failed to delete assistant memory, continuing:', memErr.message);
                    }
                    return [4 /*yield*/, supabase_1.supabase
                            .from('bankroll_locations')
                            .delete()
                            .eq('id', locationId)
                            .eq('user_id', userId)];
                case 3:
                    error = (_a.sent()).error;
                    if (error)
                        throw error;
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Get comprehensive stats for a location
 */
function getLocationStats(userId, locationId) {
    return __awaiter(this, void 0, void 0, function () {
        var location, entries, lifetimeNet, pokerNet, nonPokerNet, totalHours, wins, categoryTotals, stakeTotals, worstCategory, worstCategoryLoss, topStake, topStakeHourly;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('bankroll_locations')
                        .select('id, name')
                        .eq('id', locationId)
                        .maybeSingle()];
                case 1:
                    location = (_b.sent()).data;
                    if (!location)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, supabase_1.supabase
                            .from('bankroll_ledger')
                            .select('category, net_result, start_time, end_time, entry_date, stakes')
                            .eq('user_id', userId)
                            .eq('location_id', locationId)
                            .eq('is_revision', false)
                            .order('entry_date', { ascending: false })];
                case 2:
                    entries = (_b.sent()).data;
                    if (!entries || entries.length === 0) {
                        return [2 /*return*/, {
                                locationId: location.id,
                                name: location.name,
                                lifetimeNet: 0,
                                pokerNet: 0,
                                nonPokerNet: 0,
                                sessionCount: 0,
                                totalHours: 0,
                                hourlyRate: 0,
                                lastVisit: '',
                                winRate: 0,
                                topStake: null,
                                worstCategory: null,
                                worstCategoryLoss: 0,
                            }];
                    }
                    lifetimeNet = 0;
                    pokerNet = 0;
                    nonPokerNet = 0;
                    totalHours = 0;
                    wins = 0;
                    categoryTotals = {};
                    stakeTotals = {};
                    entries.forEach(function (e) {
                        lifetimeNet += e.net_result || 0;
                        if (e.net_result > 0)
                            wins++;
                        if (e.category === 'poker_cash' || e.category === 'poker_mtt') {
                            pokerNet += e.net_result || 0;
                        }
                        else if (e.category !== 'expense') {
                            nonPokerNet += e.net_result || 0;
                        }
                        // Track category losses
                        if (!categoryTotals[e.category])
                            categoryTotals[e.category] = 0;
                        categoryTotals[e.category] += e.net_result || 0;
                        // Track stake performance
                        if (e.stakes && e.category === 'poker_cash') {
                            if (!stakeTotals[e.stakes]) {
                                stakeTotals[e.stakes] = { net: 0, hours: 0, sessions: 0 };
                            }
                            stakeTotals[e.stakes].net += e.net_result || 0;
                            stakeTotals[e.stakes].sessions += 1;
                            if (e.start_time && e.end_time) {
                                var hours = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) /
                                    (1000 * 60 * 60);
                                stakeTotals[e.stakes].hours += hours;
                            }
                        }
                        // Calculate hours
                        if (e.start_time && e.end_time) {
                            var hours = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) /
                                (1000 * 60 * 60);
                            totalHours += hours;
                        }
                    });
                    worstCategory = null;
                    worstCategoryLoss = 0;
                    Object.entries(categoryTotals).forEach(function (_a) {
                        var cat = _a[0], net = _a[1];
                        if (cat !== 'expense' && net < worstCategoryLoss) {
                            worstCategory = cat;
                            worstCategoryLoss = net;
                        }
                    });
                    topStake = null;
                    topStakeHourly = -Infinity;
                    Object.entries(stakeTotals).forEach(function (_a) {
                        var stakes = _a[0], stats = _a[1];
                        if (stats.hours >= 5) {
                            var hourly = stats.net / stats.hours;
                            if (hourly > topStakeHourly) {
                                topStakeHourly = hourly;
                                topStake = stakes;
                            }
                        }
                    });
                    return [2 /*return*/, {
                            locationId: location.id,
                            name: location.name,
                            lifetimeNet: lifetimeNet,
                            pokerNet: pokerNet,
                            nonPokerNet: nonPokerNet,
                            sessionCount: entries.length,
                            totalHours: totalHours,
                            hourlyRate: totalHours > 0 ? lifetimeNet / totalHours : 0,
                            lastVisit: ((_a = entries[0]) === null || _a === void 0 ? void 0 : _a.entry_date) || '',
                            winRate: entries.length > 0 ? (wins / entries.length) * 100 : 0,
                            topStake: topStake,
                            worstCategory: worstCategory,
                            worstCategoryLoss: worstCategoryLoss,
                        }];
            }
        });
    });
}
/**
 * Get alerts for a location
 */
function getLocationAlerts(userId, locationId) {
    return __awaiter(this, void 0, void 0, function () {
        var stats, alerts, categoryLabels;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getLocationStats(userId, locationId)];
                case 1:
                    stats = _a.sent();
                    if (!stats)
                        return [2 /*return*/, []];
                    alerts = [];
                    // Lifetime loss warning
                    if (stats.lifetimeNet < -1000) {
                        alerts.push({
                            type: 'warning',
                            message: "Lifetime ".concat(stats.lifetimeNet >= 0 ? '+' : '-', "$").concat(Math.abs(Math.round(stats.lifetimeNet)).toLocaleString(), " at ").concat(stats.name),
                            value: "".concat(stats.lifetimeNet >= 0 ? '+' : '-', "$").concat(Math.abs(Math.round(stats.lifetimeNet)).toLocaleString()),
                        });
                    }
                    // Non-poker leak warning
                    if (stats.nonPokerNet < -500) {
                        alerts.push({
                            type: 'danger',
                            message: "Non-poker gambling losses at this venue",
                            value: "-$".concat(Math.abs(Math.round(stats.nonPokerNet)).toLocaleString()),
                        });
                    }
                    // Negative hourly warning
                    if (stats.totalHours > 20 && stats.hourlyRate < 0) {
                        alerts.push({
                            type: 'warning',
                            message: "Negative hourly rate over ".concat(Math.round(stats.totalHours), " hours"),
                            value: "".concat(stats.hourlyRate >= 0 ? '+' : '', "$").concat(Math.round(stats.hourlyRate), "/hr"),
                        });
                    }
                    // Worst category alert
                    if (stats.worstCategory && stats.worstCategoryLoss < -500) {
                        categoryLabels = {
                            casino_table: 'Table Games',
                            slots: 'Slots',
                            sports: 'Sports',
                            poker_cash: 'Cash Games',
                            poker_mtt: 'Tournaments',
                        };
                        alerts.push({
                            type: stats.worstCategory === 'slots' ? 'danger' : 'warning',
                            message: "".concat(categoryLabels[stats.worstCategory] || stats.worstCategory, " losses here"),
                            value: "-$".concat(Math.abs(Math.round(stats.worstCategoryLoss)).toLocaleString()),
                        });
                    }
                    return [2 /*return*/, alerts];
            }
        });
    });
}
/**
 * Get stake performance at a location
 */
function getStakePerformanceAtLocation(userId, locationId) {
    return __awaiter(this, void 0, void 0, function () {
        var data, stakeStats;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('bankroll_ledger')
                        .select('stakes, net_result, start_time, end_time')
                        .eq('user_id', userId)
                        .eq('location_id', locationId)
                        .eq('category', 'poker_cash')
                        .eq('is_revision', false)
                        .not('stakes', 'is', null)];
                case 1:
                    data = (_a.sent()).data;
                    if (!data)
                        return [2 /*return*/, []];
                    stakeStats = {};
                    data.forEach(function (e) {
                        if (!e.stakes)
                            return;
                        if (!stakeStats[e.stakes]) {
                            stakeStats[e.stakes] = {
                                stakes: e.stakes,
                                net: 0,
                                hours: 0,
                                hourlyRate: 0,
                                sessions: 0,
                            };
                        }
                        stakeStats[e.stakes].net += e.net_result || 0;
                        stakeStats[e.stakes].sessions += 1;
                        if (e.start_time && e.end_time) {
                            var hours = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) /
                                (1000 * 60 * 60);
                            stakeStats[e.stakes].hours += hours;
                        }
                    });
                    // Calculate hourly rates
                    Object.values(stakeStats).forEach(function (s) {
                        s.hourlyRate = s.hours > 0 ? s.net / s.hours : 0;
                    });
                    return [2 /*return*/, Object.values(stakeStats).sort(function (a, b) { return b.hourlyRate - a.hourlyRate; })];
            }
        });
    });
}
/**
 * Store assistant memory for a location
 */
function storeLocationMemory(userId_1, locationId_1, memoryType_1, content_1) {
    return __awaiter(this, arguments, void 0, function (userId, locationId, memoryType, content, severity) {
        if (severity === void 0) { severity = 1; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase.from('bankroll_assistant_memory').insert({
                        user_id: userId,
                        location_id: locationId,
                        memory_type: memoryType,
                        content: content,
                        severity: severity,
                    })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Get assistant memories for a location
 */
function getLocationMemories(userId, locationId) {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase
                        .from('bankroll_assistant_memory')
                        .select('memory_type, content, created_at')
                        .eq('user_id', userId)
                        .eq('location_id', locationId)
                        .eq('is_active', true)
                        .order('created_at', { ascending: false })];
                case 1:
                    data = (_a.sent()).data;
                    return [2 /*return*/, ((data === null || data === void 0 ? void 0 : data.map(function (m) { return ({
                            type: m.memory_type,
                            content: m.content,
                            createdAt: m.created_at,
                        }); })) || [])];
            }
        });
    });
}
/**
 * Try to detect location from coordinates
 */
function detectNearbyLocation(userId_1, latitude_1, longitude_1) {
    return __awaiter(this, arguments, void 0, function (userId, latitude, longitude, radiusKm) {
        var latDelta, lonDelta, data;
        if (radiusKm === void 0) { radiusKm = 0.5; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    latDelta = radiusKm / 111;
                    lonDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));
                    return [4 /*yield*/, supabase_1.supabase
                            .from('bankroll_locations')
                            .select('id, name')
                            .eq('user_id', userId)
                            .gte('latitude', latitude - latDelta)
                            .lte('latitude', latitude + latDelta)
                            .gte('longitude', longitude - lonDelta)
                            .lte('longitude', longitude + lonDelta)
                            .limit(1)
                            .maybeSingle()];
                case 1:
                    data = (_a.sent()).data;
                    return [2 /*return*/, data || null];
            }
        });
    });
}
