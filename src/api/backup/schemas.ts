// src/api/backup/schemas.ts — proto2 compatível com Mihon, Tachiyomi e Aniyomi
const HEAD = `syntax = "proto2";`;

const SHARED_MESSAGES = `
message BackupChapter {
  optional string url = 1;
  optional string name = 2;
  optional string scanlator = 3;
  optional bool read = 4;
  optional bool bookmark = 5;
  optional int64 lastPageRead = 6;
  optional int64 dateFetch = 7;
  optional int64 dateUpload = 8;
  optional float chapterNumber = 9;
  optional int64 sourceOrder = 10;
  optional int64 lastModifiedAt = 11;
  optional int64 version = 12;
  optional bytes memo = 13;
}

message BackupCategory {
  optional string name = 1;
  optional int64 order = 2;
  optional int64 id = 3;
  optional int64 flags = 100;
}

message BrokenBackupSource {
  optional string name = 0;
  optional int64 sourceId = 1;
}

message BackupSource {
  optional string name = 1;
  optional int64 sourceId = 2;
}

message BackupTracking {
  optional int32 syncId = 1;
  optional int64 libraryId = 2;
  optional int32 mediaIdInt = 3;
  optional string trackingUrl = 4;
  optional string title = 5;
  optional float lastChapterRead = 6;
  optional int32 totalChapters = 7;
  optional float score = 8;
  optional int32 status = 9;
  optional int64 startedReadingDate = 10;
  optional int64 finishedReadingDate = 11;
  optional bool private = 12;
  optional int64 mediaId = 100;
}

message BrokenBackupHistory {
  optional string url = 0;
  optional int64 lastRead = 1;
  optional int64 readDuration = 2;
}

message BackupHistory {
  optional string url = 1;
  optional int64 lastRead = 2;
  optional int64 readDuration = 3;
}

message BackupExtensionStore {
  optional string indexUrl = 1;
  optional string name = 2;
  optional string badgeLabel = 3;
  optional string contactWebsite = 4;
  optional string signingKey = 5;
  optional string contactDiscord = 6;
  optional bool isLegacy = 7;
  optional string extensionListUrl = 8;
}

message BackupPreference {
  optional string key = 1;
  optional PreferenceValue value = 2;
}

message BackupSourcePreferences {
  optional string sourceKey = 1;
  repeated BackupPreference prefs = 2;
}

// PreferenceValue usa wire type 2 (bytes) para encapsular subtipos
message PreferenceValue {
  optional string type = 1;
  optional bytes value = 2;
}

message BooleanPreferenceValue { optional bool value = 1; }
message FloatPreferenceValue { optional float value = 1; }
message IntPreferenceValue { optional int32 value = 1; }
message LongPreferenceValue { optional int64 value = 1; }
message StringPreferenceValue { optional string value = 1; }
message StringSetPreferenceValue { repeated string value = 1; }
`;

export const MIHON_PROTO = `${HEAD}
message Backup {
  repeated BackupManga backupManga = 1;
  repeated BackupCategory backupCategories = 2;
  repeated BrokenBackupSource backupBrokenSources = 100;
  repeated BackupSource backupSources = 101;
  repeated BackupPreference backupPreferences = 104;
  repeated BackupSourcePreferences backupSourcePreferences = 105;
  repeated BackupExtensionStore backupExtensionStores = 106;
  repeated string backupExtensionRepo = 107;
  repeated string backupMangaExtensionRepo = 506;
}

message BackupManga {
  optional int64 source = 1;
  optional string url = 2;
  optional string title = 3;
  optional string artist = 4;
  optional string author = 5;
  optional string description = 6;
  repeated string genre = 7;
  optional int32 status = 8;
  optional string thumbnailUrl = 9;
  optional string customThumbnailUrl = 10;
  optional int64 dateAdded = 13;
  optional int32 viewer = 14;
  repeated BackupChapter chapters = 16;
  repeated int64 categories = 17;
  repeated BackupTracking tracking = 18;
  optional bool favorite = 100;
  optional int32 chapterFlags = 101;
  repeated BrokenBackupHistory brokenHistory = 102;
  optional int32 viewer_flags = 103;
  repeated BackupHistory history = 104;
  optional int32 updateStrategy = 105;
  optional int64 lastModifiedAt = 106;
  optional int64 favoriteModifiedAt = 107;
  repeated string excludedScanlators = 108;
  optional int64 version = 109;
  optional string notes = 110;
  optional bool initialized = 111;
  optional bytes memo = 112;
}

${SHARED_MESSAGES}
`;

export const ANIYOMI_PROTO = `${HEAD}
message Backup {
  repeated BackupManga backupManga = 1;
  repeated BackupCategory backupCategories = 2;
  repeated BrokenBackupSource backupBrokenSources = 100;
  repeated BackupSource backupSources = 101;
  repeated BackupPreference backupPreferences = 104;
  repeated BackupSourcePreferences backupSourcePreferences = 105;
  repeated BackupExtensionStore backupExtensionStores = 106;
  repeated string backupExtensionRepo = 107;
  repeated BackupAnime backupAnime = 501;
  repeated BackupCategory backupAnimeCategories = 502;
  repeated BackupSource backupAnimeSources = 503;
  repeated BackupExtension backupExtensions = 504;
  repeated string backupAnimeExtensionRepo = 505;
  repeated string backupMangaExtensionRepo = 506;
}

message BackupManga {
  optional int64 source = 1;
  optional string url = 2;
  optional string title = 3;
  optional string artist = 4;
  optional string author = 5;
  optional string description = 6;
  repeated string genre = 7;
  optional int32 status = 8;
  optional string thumbnailUrl = 9;
  optional string customThumbnailUrl = 10;
  optional int64 dateAdded = 13;
  optional int32 viewer = 14;
  repeated BackupChapter chapters = 16;
  repeated int64 categories = 17;
  repeated BackupTracking tracking = 18;
  optional bool favorite = 100;
  optional int32 chapterFlags = 101;
  repeated BrokenBackupHistory brokenHistory = 102;
  optional int32 viewer_flags = 103;
  repeated BackupHistory history = 104;
  optional int32 updateStrategy = 105;
  optional int64 lastModifiedAt = 106;
  optional int64 favoriteModifiedAt = 107;
  repeated string excludedScanlators = 108;
  optional int64 version = 109;
  optional string notes = 110;
  optional bool initialized = 111;
  optional bytes memo = 112;
}

message BackupAnime {
  optional int64 source = 1;
  optional string url = 2;
  optional string title = 3;
  optional string artist = 4;
  optional string author = 5;
  optional string description = 6;
  repeated string genre = 7;
  optional int32 status = 8;
  optional string thumbnailUrl = 9;
  optional string customThumbnailUrl = 10;
  optional int64 dateAdded = 13;
  optional int32 viewer = 14;
  repeated BackupEpisode episodes = 16;
  repeated int64 categories = 17;
  repeated BackupTracking tracking = 18;
  optional bool favorite = 100;
  optional int32 chapterFlags = 101;
  repeated BrokenBackupHistory brokenHistory = 102;
  optional int32 viewer_flags = 103;
  repeated BackupHistory history = 104;
  optional int32 updateStrategy = 105;
  optional int64 lastModifiedAt = 106;
  optional int64 favoriteModifiedAt = 107;
  repeated string excludedScanlators = 108;
  optional int64 version = 109;
  optional string notes = 110;
  optional bool initialized = 111;
  optional bytes memo = 112;
  optional string backgroundUrl = 500;
}

message BackupEpisode {
  optional string url = 1;
  optional string name = 2;
  optional string scanlator = 3;
  optional bool seen = 4;
  optional bool bookmark = 5;
  optional int64 lastSecondSeen = 6;
  optional int64 dateFetch = 7;
  optional int64 dateUpload = 8;
  optional float episodeNumber = 9;
  optional int64 sourceOrder = 10;
  optional int64 lastModifiedAt = 11;
  optional int64 version = 12;
  optional bytes memo = 13;
}

message BackupExtension {
  optional string pkgName = 1;
  optional string name = 2;
  optional string versionName = 3;
  optional int64 versionCode = 4;
}

${SHARED_MESSAGES}
`;
