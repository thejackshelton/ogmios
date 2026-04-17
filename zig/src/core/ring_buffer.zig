const std = @import("std");
const Entry = @import("options.zig").Entry;

/// Bounded ring buffer. Drops oldest entries and increments droppedCount on overflow.
/// Phase 1 implementation — single-writer, drained serially.
/// Phase 3 will add a mutex when a Zig poll thread writes while Node drains.
pub const RingBuffer = struct {
    allocator: std.mem.Allocator,
    entries: []Entry,
    head: usize = 0,
    tail: usize = 0,
    len: usize = 0,
    capacity: usize,
    droppedCount: u64 = 0,

    pub fn init(allocator: std.mem.Allocator, capacity: usize) !RingBuffer {
        const entries = try allocator.alloc(Entry, capacity);
        return .{
            .allocator = allocator,
            .entries = entries,
            .capacity = capacity,
        };
    }

    pub fn deinit(self: *RingBuffer) void {
        // Strings in entries are producer-owned; ring holds borrowed slices.
        self.allocator.free(self.entries);
    }

    pub fn push(self: *RingBuffer, entry: Entry) void {
        if (self.len == self.capacity) {
            self.head = (self.head + 1) % self.capacity;
            self.droppedCount += 1;
        } else {
            self.len += 1;
        }
        self.entries[self.tail] = entry;
        self.tail = (self.tail + 1) % self.capacity;
    }

    pub fn drain(self: *RingBuffer, out: []Entry) usize {
        const n = @min(self.len, out.len);
        for (0..n) |i| {
            out[i] = self.entries[(self.head + i) % self.capacity];
        }
        self.head = (self.head + n) % self.capacity;
        self.len -= n;
        return n;
    }

    pub fn clear(self: *RingBuffer) void {
        self.head = 0;
        self.tail = 0;
        self.len = 0;
    }
};
