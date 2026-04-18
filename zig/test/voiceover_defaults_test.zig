const std = @import("std");
const defaults = @import("../src/drivers/voiceover/defaults.zig");

// ---------------------------------------------------------------------------
// Task 1 tests: catalog, version parse, domain resolver
// ---------------------------------------------------------------------------

test "keyCatalog has exactly 9 entries" {
    const catalog = defaults.keyCatalog();
    try std.testing.expectEqual(@as(usize, 9), catalog.len);
    try std.testing.expectEqual(@as(usize, defaults.CATALOG_LEN), catalog.len);
}

test "keyCatalog entry 0 is SCREnableAppleScript bool=true" {
    const catalog = defaults.keyCatalog();
    try std.testing.expectEqualStrings("SCREnableAppleScript", catalog[0].name);
    try std.testing.expectEqual(defaults.PlistValueType.boolean, catalog[0].value_type);
    try std.testing.expectEqual(true, catalog[0].ogmios_default.boolean);
}

test "keyCatalog entry 7 is SpeakChannel = voice.Alex" {
    const catalog = defaults.keyCatalog();
    try std.testing.expectEqualStrings("SCRCategories_SCRCategoryVoices_SCRSpeakChannel", catalog[7].name);
    try std.testing.expectEqual(defaults.PlistValueType.string, catalog[7].value_type);
    try std.testing.expectEqualStrings("com.apple.speech.synthesis.voice.Alex", catalog[7].ogmios_default.string);
}

test "resolvePlistDomain for Sonoma (14.x) returns legacy domain" {
    const allocator = std.testing.allocator;
    const got = try defaults.resolvePlistDomain(allocator, .{ .major = 14, .minor = 7 }, "/Users/test");
    defer allocator.free(got);
    try std.testing.expectEqualStrings("com.apple.VoiceOver4/default", got);
}

test "resolvePlistDomain for Sequoia (15.2) returns Group Container path" {
    const allocator = std.testing.allocator;
    const got = try defaults.resolvePlistDomain(allocator, .{ .major = 15, .minor = 2 }, "/Users/test");
    defer allocator.free(got);
    try std.testing.expectEqualStrings(
        "/Users/test/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4",
        got,
    );
    try std.testing.expect(std.mem.endsWith(u8, got, "com.apple.VoiceOver4"));
}

test "resolvePlistDomain for Tahoe (26.0) returns same Group Container shape" {
    const allocator = std.testing.allocator;
    const got = try defaults.resolvePlistDomain(allocator, .{ .major = 26, .minor = 0 }, "/Users/test");
    defer allocator.free(got);
    try std.testing.expectEqualStrings(
        "/Users/test/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4",
        got,
    );
}

test "parseMacOSVersion handles 15.2" {
    const v = try defaults.parseMacOSVersion("15.2");
    try std.testing.expectEqual(@as(u16, 15), v.major);
    try std.testing.expectEqual(@as(u16, 2), v.minor);
}

test "parseMacOSVersion handles 14.7.1 (ignores patch)" {
    const v = try defaults.parseMacOSVersion("14.7.1");
    try std.testing.expectEqual(@as(u16, 14), v.major);
    try std.testing.expectEqual(@as(u16, 7), v.minor);
}

test "parseMacOSVersion trims whitespace" {
    const v = try defaults.parseMacOSVersion("  26.0\n");
    try std.testing.expectEqual(@as(u16, 26), v.major);
    try std.testing.expectEqual(@as(u16, 0), v.minor);
}

// ---------------------------------------------------------------------------
// Task 2 tests: snapshot / configure / restore via a MockSubprocessRunner
// ---------------------------------------------------------------------------

/// Records every argv invocation + provides pre-programmed responses.
const MockSubprocessRunner = struct {
    allocator: std.mem.Allocator,
    /// Owned copies of each argv array passed to run(). index 0 = first call.
    argv_log: std.ArrayListUnmanaged([]const []const u8) = .empty,
    /// Pre-programmed responses, consumed FIFO. Each entry is (stdout, stderr, exit).
    responses: std.ArrayListUnmanaged(Response) = .empty,
    call_count: usize = 0,

    const Response = struct { stdout: []const u8, stderr: []const u8, exit_code: u8 };

    fn init(allocator: std.mem.Allocator) MockSubprocessRunner {
        return .{ .allocator = allocator };
    }

    fn deinit(self: *MockSubprocessRunner) void {
        for (self.argv_log.items) |argv| {
            for (argv) |a| self.allocator.free(a);
            self.allocator.free(argv);
        }
        self.argv_log.deinit(self.allocator);
        self.responses.deinit(self.allocator);
    }

    fn pushResponse(self: *MockSubprocessRunner, stdout: []const u8, stderr: []const u8, exit_code: u8) !void {
        try self.responses.append(self.allocator, .{
            .stdout = stdout,
            .stderr = stderr,
            .exit_code = exit_code,
        });
    }

    fn asRunner(self: *MockSubprocessRunner) defaults.SubprocessRunner {
        return .{ .ctx = @ptrCast(self), .runFn = runImpl };
    }

    fn runImpl(ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!defaults.RunResult {
        const self: *MockSubprocessRunner = @ptrCast(@alignCast(ctx));
        // Record argv with owned copies (so caller can reuse stack-allocated slices).
        const recorded = try self.allocator.alloc([]const u8, argv.len);
        for (argv, 0..) |a, i| recorded[i] = try self.allocator.dupe(u8, a);
        try self.argv_log.append(self.allocator, recorded);

        if (self.call_count >= self.responses.items.len) {
            return error.NoMockResponseProgrammed;
        }
        const resp = self.responses.items[self.call_count];
        self.call_count += 1;
        return defaults.RunResult{
            .stdout = try allocator.dupe(u8, resp.stdout),
            .stderr = try allocator.dupe(u8, resp.stderr),
            .exit_code = resp.exit_code,
        };
    }
};

test "snapshotSettings captures all 9 keys with mixed value types" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // Program 9 responses mirroring catalog order:
    // 0 bool (1), 1 bool (1), 2 int (90), 3 int (0), 4 bool (0), 5 int (0),
    // 6 bool (1), 7 string, 8 bool (0)
    try mock.pushResponse("1\n", "", 0);
    try mock.pushResponse("1\n", "", 0);
    try mock.pushResponse("90\n", "", 0);
    try mock.pushResponse("0\n", "", 0);
    try mock.pushResponse("0\n", "", 0);
    try mock.pushResponse("0\n", "", 0);
    try mock.pushResponse("1\n", "", 0);
    try mock.pushResponse("com.apple.speech.synthesis.voice.Alex\n", "", 0);
    try mock.pushResponse("0\n", "", 0);

    var snap = try defaults.snapshotSettings(allocator, mock.asRunner(), "com.apple.VoiceOver4/default");
    defer snap.deinit();

    try std.testing.expectEqual(@as(usize, 9), mock.call_count);
    try std.testing.expectEqual(true, snap.entries[0].boolean);
    try std.testing.expectEqual(@as(i64, 90), snap.entries[2].integer);
    try std.testing.expectEqualStrings("com.apple.speech.synthesis.voice.Alex", snap.entries[7].string);
    try std.testing.expectEqual(false, snap.entries[8].boolean);
}

test "snapshotSettings records missing key when stderr says 'does not exist'" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // Key 0 exists, key 1 is missing, keys 2..8 exist.
    try mock.pushResponse("1\n", "", 0);
    try mock.pushResponse("", "The domain/default pair of (x, y) does not exist\n", 1);
    try mock.pushResponse("90\n", "", 0);
    try mock.pushResponse("0\n", "", 0);
    try mock.pushResponse("0\n", "", 0);
    try mock.pushResponse("0\n", "", 0);
    try mock.pushResponse("1\n", "", 0);
    try mock.pushResponse("com.apple.speech.synthesis.voice.Alex\n", "", 0);
    try mock.pushResponse("0\n", "", 0);

    var snap = try defaults.snapshotSettings(allocator, mock.asRunner(), "com.apple.VoiceOver4/default");
    defer snap.deinit();

    try std.testing.expect(snap.entries[1] == .missing);
    try std.testing.expect(snap.entries[0] == .boolean);
}

test "configureSettings respects InitOptions.speech_rate override" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // 9 successful writes.
    var i: usize = 0;
    while (i < 9) : (i += 1) try mock.pushResponse("", "", 0);

    try defaults.configureSettings(allocator, mock.asRunner(), "dom", .{
        .allocator = allocator,
        .speech_rate = 50,
        .mute = true,
    });

    // All 9 writes happened.
    try std.testing.expectEqual(@as(usize, 9), mock.call_count);
    // The rate-write (catalog index 2, 3rd call) should carry "50" not "90".
    const rate_argv = mock.argv_log.items[2];
    try std.testing.expectEqualStrings("/usr/bin/defaults", rate_argv[0]);
    try std.testing.expectEqualStrings("write", rate_argv[1]);
    try std.testing.expectEqualStrings("-int", rate_argv[4]);
    try std.testing.expectEqualStrings("50", rate_argv[5]);
}

test "configureSettings with mute=false skips the DisableSound key" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // 8 writes (all except mute).
    var i: usize = 0;
    while (i < 8) : (i += 1) try mock.pushResponse("", "", 0);

    try defaults.configureSettings(allocator, mock.asRunner(), "dom", .{
        .allocator = allocator,
        .speech_rate = 90,
        .mute = false,
    });

    try std.testing.expectEqual(@as(usize, 8), mock.call_count);
    // None of the argv entries should reference the mute key's full name.
    for (mock.argv_log.items) |argv| {
        for (argv) |a| {
            try std.testing.expect(std.mem.indexOf(u8, a, "SCRDisableSound") == null);
        }
    }
}

test "restoreSettings issues 'defaults delete' for missing keys, 'write' for present" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // Build a snapshot manually: key 0 is bool=true, key 1 is missing, rest missing.
    var snap = defaults.PlistSnapshot{
        .allocator = allocator,
        .domain = try allocator.dupe(u8, "dom"),
        .entries = undefined,
    };
    defer snap.deinit();
    snap.entries[0] = .{ .boolean = true };
    snap.entries[1] = .missing;
    snap.entries[2] = .{ .integer = 80 };
    snap.entries[3] = .{ .integer = 0 };
    snap.entries[4] = .{ .boolean = false };
    snap.entries[5] = .{ .integer = 0 };
    snap.entries[6] = .{ .boolean = true };
    snap.entries[7] = .{ .string = try allocator.dupe(u8, "com.apple.speech.synthesis.voice.Alex Premium") };
    snap.entries[8] = .{ .boolean = false };

    // 9 writes/deletes, all succeed (missing-key delete succeeds cleanly).
    var i: usize = 0;
    while (i < 9) : (i += 1) try mock.pushResponse("", "", 0);

    try defaults.restoreSettings(allocator, mock.asRunner(), &snap);

    try std.testing.expectEqual(@as(usize, 9), mock.call_count);
    // Second call (index 1) should be a delete.
    try std.testing.expectEqualStrings("delete", mock.argv_log.items[1][1]);
    // First call (index 0) should be a write -bool.
    try std.testing.expectEqualStrings("write", mock.argv_log.items[0][1]);
    try std.testing.expectEqualStrings("-bool", mock.argv_log.items[0][4]);
}

test "restoreSettings writes string with embedded space via argv, not via shell" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    var snap = defaults.PlistSnapshot{
        .allocator = allocator,
        .domain = try allocator.dupe(u8, "dom"),
        .entries = undefined,
    };
    defer snap.deinit();
    // Fill 8 entries with safe defaults, put the spacey string at index 7.
    snap.entries[0] = .{ .boolean = true };
    snap.entries[1] = .{ .boolean = true };
    snap.entries[2] = .{ .integer = 90 };
    snap.entries[3] = .{ .integer = 0 };
    snap.entries[4] = .{ .boolean = false };
    snap.entries[5] = .{ .integer = 0 };
    snap.entries[6] = .{ .boolean = true };
    snap.entries[7] = .{ .string = try allocator.dupe(u8, "Alex Premium Voice") };
    snap.entries[8] = .{ .boolean = false };

    var i: usize = 0;
    while (i < 9) : (i += 1) try mock.pushResponse("", "", 0);

    try defaults.restoreSettings(allocator, mock.asRunner(), &snap);

    const voice_argv = mock.argv_log.items[7];
    try std.testing.expectEqualStrings("-string", voice_argv[4]);
    try std.testing.expectEqualStrings("Alex Premium Voice", voice_argv[5]);
    // The space is a literal argv element — not shell-escaped.
    try std.testing.expect(std.mem.indexOf(u8, voice_argv[5], "\\ ") == null);
    try std.testing.expect(std.mem.indexOf(u8, voice_argv[5], "\"") == null);
}

test "writeKey emits correct -type flags per value type" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // 9 writes covering catalog (which has all 3 types: bool, int, string).
    var i: usize = 0;
    while (i < 9) : (i += 1) try mock.pushResponse("", "", 0);

    try defaults.configureSettings(allocator, mock.asRunner(), "dom", .{
        .allocator = allocator,
        .speech_rate = 90,
        .mute = true,
    });

    // Check that we see at least one -bool, one -int, and one -string.
    var saw_bool = false;
    var saw_int = false;
    var saw_string = false;
    for (mock.argv_log.items) |argv| {
        if (argv.len > 4) {
            if (std.mem.eql(u8, argv[4], "-bool")) saw_bool = true;
            if (std.mem.eql(u8, argv[4], "-int")) saw_int = true;
            if (std.mem.eql(u8, argv[4], "-string")) saw_string = true;
        }
    }
    try std.testing.expect(saw_bool);
    try std.testing.expect(saw_int);
    try std.testing.expect(saw_string);
}
