const std = @import("std");
const opts_mod = @import("../../core/options.zig");
const subprocess = @import("../../core/subprocess.zig");
const c = std.c;

pub const InitOptions = opts_mod.InitOptions;

// ---------------------------------------------------------------------------
// macOS version detection + plist-domain resolution
// ---------------------------------------------------------------------------

pub const MacOSVersion = struct {
    major: u16,
    minor: u16,
};

/// Parse a `sw_vers -productVersion` string like "14.7.1" or "26.0" into a
/// MacOSVersion. The patch component (if any) is ignored.
pub fn parseMacOSVersion(s: []const u8) !MacOSVersion {
    const trimmed = std.mem.trim(u8, s, " \t\r\n");
    var it = std.mem.splitScalar(u8, trimmed, '.');
    const major_str = it.next() orelse return error.InvalidVersion;
    const minor_str = it.next() orelse "0";
    const major = std.fmt.parseInt(u16, major_str, 10) catch return error.InvalidVersion;
    const minor = std.fmt.parseInt(u16, minor_str, 10) catch return error.InvalidVersion;
    return .{ .major = major, .minor = minor };
}

/// Shell `sw_vers -productVersion` and parse the result. Allocator is used
/// internally for the subprocess output buffer; the returned struct is by-value.
pub fn detectMacOSVersion(allocator: std.mem.Allocator) !MacOSVersion {
    const argv = [_][]const u8{ "/usr/bin/sw_vers", "-productVersion" };
    var result = try subprocess.runCollect(allocator, &argv);
    defer result.deinit(allocator);
    return parseMacOSVersion(result.stdout);
}

/// Detect the user's HOME directory via the environment. Production callers use
/// this; tests pass an explicit home_dir to `resolvePlistDomain` instead.
pub fn detectHomeDir(allocator: std.mem.Allocator) ![]const u8 {
    const ptr = c.getenv("HOME") orelse return error.NoHomeDir;
    const slice = std.mem.span(@as([*:0]const u8, ptr));
    return allocator.dupe(u8, slice);
}

/// Return the `defaults`-CLI domain string for the running macOS version.
/// Sonoma (14):  "com.apple.VoiceOver4/default"
/// Sequoia+ (15+): absolute path to the Group Container plist MINUS the `.plist`
///   suffix (the `defaults` CLI appends it implicitly).
///
/// Caller owns the returned string and must free with `allocator.free`.
/// `home_dir` is injected so tests don't have to mutate the environment; in
/// production callers pass the result of `detectHomeDir`.
pub fn resolvePlistDomain(allocator: std.mem.Allocator, version: MacOSVersion, home_dir: []const u8) ![]const u8 {
    if (version.major <= 14) {
        return allocator.dupe(u8, "com.apple.VoiceOver4/default");
    }
    // Sequoia (15) and Tahoe (26) both use the Group Container path.
    return std.fmt.allocPrint(
        allocator,
        "{s}/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4",
        .{home_dir},
    );
}

// ---------------------------------------------------------------------------
// Plist key catalog (9 keys, verbatim from 03-CONTEXT.md D-03 / Guidepup)
// ---------------------------------------------------------------------------

pub const PlistValueType = enum { boolean, integer, string };

pub const PlistValue = union(enum) {
    boolean: bool,
    integer: i64,
    /// Owned by whichever allocator created the snapshot; freed in PlistSnapshot.deinit.
    string: []const u8,
    missing: void,
};

pub const PlistKey = struct {
    name: []const u8,
    value_type: PlistValueType,
    /// What munadi writes during `configureSettings`.
    munadi_default: PlistValue,
};

/// The 9 VoiceOver plist keys snapshotted on start and restored on stop.
/// Names copied verbatim from Guidepup's `src/macOS/VoiceOver/configureSettings.ts`
/// via 03-CONTEXT.md D-03. Deviation will break VO startup or capture.
pub fn keyCatalog() []const PlistKey {
    const catalog = comptime [_]PlistKey{
        .{ .name = "SCREnableAppleScript", .value_type = .boolean, .munadi_default = .{ .boolean = true } },
        .{ .name = "SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound", .value_type = .boolean, .munadi_default = .{ .boolean = true } },
        .{ .name = "SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent", .value_type = .integer, .munadi_default = .{ .integer = 90 } },
        .{ .name = "SCRCategories_SCRCategoryActivities_SCRVerbositySettings_SCRVerbosityLevel", .value_type = .integer, .munadi_default = .{ .integer = 0 } },
        .{ .name = "SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints", .value_type = .boolean, .munadi_default = .{ .boolean = false } },
        .{ .name = "SCRCategories_SCRCategoryPunctuationAndSymbols_SCRPunctuationSettings_SCRPunctuationLevel", .value_type = .integer, .munadi_default = .{ .integer = 0 } },
        .{ .name = "SCRCategories_SCRCategoryVerbosity_SCRShouldSpeakStaticText", .value_type = .boolean, .munadi_default = .{ .boolean = true } },
        .{ .name = "SCRCategories_SCRCategoryVoices_SCRSpeakChannel", .value_type = .string, .munadi_default = .{ .string = "com.apple.speech.synthesis.voice.Alex" } },
        .{ .name = "SCRShouldAnnounceKeyCommands", .value_type = .boolean, .munadi_default = .{ .boolean = false } },
    };
    return &catalog;
}

/// Well-known indices into keyCatalog() used by configureSettings for the
/// options-override slots (speech rate + mute).
pub const KEY_INDEX_MUTE: usize = 1;
pub const KEY_INDEX_SPEECH_RATE: usize = 2;

pub const CATALOG_LEN: usize = 9;

// ---------------------------------------------------------------------------
// SubprocessRunner abstraction (mockable for unit tests)
// ---------------------------------------------------------------------------

pub const RunResult = struct {
    stdout: []u8,
    stderr: []u8,
    exit_code: u8,

    pub fn deinit(self: *RunResult, allocator: std.mem.Allocator) void {
        allocator.free(self.stdout);
        allocator.free(self.stderr);
    }
};

pub const SubprocessRunner = struct {
    ctx: *anyopaque,
    runFn: *const fn (ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!RunResult,

    pub fn run(self: SubprocessRunner, allocator: std.mem.Allocator, argv: []const []const u8) !RunResult {
        return self.runFn(self.ctx, allocator, argv);
    }
};

/// Real SubprocessRunner that spawns a child process via our raw-POSIX
/// wrapper (see src/core/subprocess.zig). Used at runtime; tests inject a
/// MockSubprocessRunner instead.
fn realRun(ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!RunResult {
    _ = ctx;
    const sp_result = try subprocess.runCollect(allocator, argv);
    // RunResult owns the slices; transfer ownership by rewrapping. The
    // `subprocess.RunResult` layout is identical but lives in a different
    // module — moving the fields avoids a copy.
    return RunResult{
        .stdout = sp_result.stdout,
        .stderr = sp_result.stderr,
        .exit_code = sp_result.exit_code,
    };
}

pub const realSubprocessRunner: SubprocessRunner = .{
    .ctx = @constCast(@ptrCast(&realRun)), // ctx unused; any non-null opaque pointer is fine
    .runFn = realRun,
};

// ---------------------------------------------------------------------------
// Snapshot / configure / restore
// ---------------------------------------------------------------------------

pub const PlistSnapshot = struct {
    allocator: std.mem.Allocator,
    /// Owned copy of the domain string.
    domain: []const u8,
    /// One PlistValue per key in keyCatalog(), in catalog order.
    entries: [CATALOG_LEN]PlistValue,

    pub fn deinit(self: *PlistSnapshot) void {
        for (self.entries) |e| switch (e) {
            .string => |s| self.allocator.free(s),
            else => {},
        };
        self.allocator.free(self.domain);
    }
};

/// Snapshot all 9 VO plist keys via the `defaults read` CLI.
/// - Exit 0 + numeric stdout → .integer
/// - Exit 0 + "1"/"0" stdout for boolean-typed key → .boolean
/// - Exit 0 + other stdout → .string (owned dupe)
/// - Non-zero exit + stderr mentions "does not exist" → .missing
/// - Any other non-zero exit → error.DefaultsReadFailed
pub fn snapshotSettings(
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    domain: []const u8,
) !PlistSnapshot {
    var snap = PlistSnapshot{
        .allocator = allocator,
        .domain = try allocator.dupe(u8, domain),
        .entries = undefined,
    };
    errdefer {
        // Free whatever we've owned so far on partial construction.
        for (snap.entries, 0..) |e, i| {
            if (i >= CATALOG_LEN) break;
            switch (e) {
                .string => |s| allocator.free(s),
                else => {},
            }
        }
        allocator.free(snap.domain);
    }

    const catalog = keyCatalog();
    var i: usize = 0;
    while (i < CATALOG_LEN) : (i += 1) {
        const key = catalog[i];
        const argv = [_][]const u8{ "/usr/bin/defaults", "read", domain, key.name };
        var result = try runner.run(allocator, &argv);
        defer result.deinit(allocator);

        if (result.exit_code != 0) {
            // Key absent at read time: treat as .missing.
            if (std.mem.indexOf(u8, result.stderr, "does not exist") != null) {
                snap.entries[i] = .missing;
                continue;
            }
            return error.DefaultsReadFailed;
        }

        const trimmed = std.mem.trim(u8, result.stdout, " \t\r\n");
        snap.entries[i] = try parseReadResult(allocator, key.value_type, trimmed);
    }

    return snap;
}

fn parseReadResult(allocator: std.mem.Allocator, vt: PlistValueType, trimmed: []const u8) !PlistValue {
    switch (vt) {
        .boolean => {
            // `defaults read` for bools typically outputs "1" or "0".
            if (trimmed.len == 1 and (trimmed[0] == '1' or trimmed[0] == '0')) {
                return .{ .boolean = trimmed[0] == '1' };
            }
            // Fall back to string interpretation so we can faithfully restore.
            return .{ .string = try allocator.dupe(u8, trimmed) };
        },
        .integer => {
            const parsed = std.fmt.parseInt(i64, trimmed, 10) catch {
                return .{ .string = try allocator.dupe(u8, trimmed) };
            };
            return .{ .integer = parsed };
        },
        .string => {
            return .{ .string = try allocator.dupe(u8, trimmed) };
        },
    }
}

/// Write munadi's defaults, honoring per-call InitOptions overrides:
/// - `opts.mute == false` skips the DisableSound key entirely (user keeps theirs).
/// - `opts.speech_rate` replaces the catalog's 90 default.
pub fn configureSettings(
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    domain: []const u8,
    opts: InitOptions,
) !void {
    const catalog = keyCatalog();
    var i: usize = 0;
    while (i < CATALOG_LEN) : (i += 1) {
        if (i == KEY_INDEX_MUTE and !opts.mute) continue;

        const key = catalog[i];
        const effective_value: PlistValue = if (i == KEY_INDEX_SPEECH_RATE)
            PlistValue{ .integer = @intCast(opts.speech_rate) }
        else
            key.munadi_default;

        try writeKey(allocator, runner, domain, key, effective_value);
    }
}

/// Restore each snapshotted key: present values get `defaults write`, missing
/// keys get `defaults delete` (idempotently — "does not exist" on delete is OK).
pub fn restoreSettings(
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    snapshot: *const PlistSnapshot,
) !void {
    const catalog = keyCatalog();
    var i: usize = 0;
    while (i < CATALOG_LEN) : (i += 1) {
        const key = catalog[i];
        switch (snapshot.entries[i]) {
            .missing => try deleteKey(allocator, runner, snapshot.domain, key.name),
            .boolean, .integer, .string => try writeKey(
                allocator,
                runner,
                snapshot.domain,
                key,
                snapshot.entries[i],
            ),
        }
    }
}

fn writeKey(
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    domain: []const u8,
    key: PlistKey,
    value: PlistValue,
) !void {
    switch (value) {
        .boolean => |b| {
            const argv = [_][]const u8{
                "/usr/bin/defaults", "write", domain, key.name, "-bool", if (b) "true" else "false",
            };
            var r = try runner.run(allocator, &argv);
            defer r.deinit(allocator);
            if (r.exit_code != 0) return error.DefaultsWriteFailed;
        },
        .integer => |n| {
            var buf: [32]u8 = undefined;
            const s = try std.fmt.bufPrint(&buf, "{d}", .{n});
            const argv = [_][]const u8{
                "/usr/bin/defaults", "write", domain, key.name, "-int", s,
            };
            var r = try runner.run(allocator, &argv);
            defer r.deinit(allocator);
            if (r.exit_code != 0) return error.DefaultsWriteFailed;
        },
        .string => |s| {
            // argv array — never interpolate; s may contain spaces/quotes.
            const argv = [_][]const u8{
                "/usr/bin/defaults", "write", domain, key.name, "-string", s,
            };
            var r = try runner.run(allocator, &argv);
            defer r.deinit(allocator);
            if (r.exit_code != 0) return error.DefaultsWriteFailed;
        },
        .missing => return error.CannotWriteMissing,
    }
}

fn deleteKey(
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    domain: []const u8,
    key_name: []const u8,
) !void {
    const argv = [_][]const u8{ "/usr/bin/defaults", "delete", domain, key_name };
    var r = try runner.run(allocator, &argv);
    defer r.deinit(allocator);
    if (r.exit_code == 0) return;
    // Key already absent: still a successful restore.
    if (std.mem.indexOf(u8, r.stderr, "does not exist") != null) return;
    return error.DefaultsRestoreFailed;
}
