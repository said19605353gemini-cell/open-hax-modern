<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$storeFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'openhax_modern_rooms.json';
$ttlSeconds = 20;
$now = time();

function loadRooms(string $file, int $now, int $ttl): array {
    if (!file_exists($file)) {
        return [];
    }
    $fp = @fopen($file, 'r');
    if (!$fp) {
        return [];
    }
    @flock($fp, LOCK_SH);
    $raw = stream_get_contents($fp);
    @flock($fp, LOCK_UN);
    @fclose($fp);

    $decoded = json_decode($raw ?: '[]', true);
    if (!is_array($decoded)) {
        return [];
    }

    $active = [];
    foreach ($decoded as $room) {
        if (!is_array($room) || empty($room['code'])) {
            continue;
        }
        $updated = (int)($room['updatedAt'] ?? 0);
        if (($now - $updated) <= $ttl) {
            $active[$room['code']] = $room;
        }
    }
    return $active;
}

function saveRooms(string $file, array $rooms): bool {
    $fp = @fopen($file, 'c+');
    if (!$fp) {
        return false;
    }
    if (!@flock($fp, LOCK_EX)) {
        @fclose($fp);
        return false;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode(array_values($rooms), JSON_UNESCAPED_UNICODE));
    fflush($fp);
    @flock($fp, LOCK_UN);
    @fclose($fp);
    return true;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? 'list';

if ($method === 'GET' && $action === 'list') {
    $rooms = loadRooms($storeFile, $now, $ttlSeconds);
    $list = array_values($rooms);
    usort($list, function (array $a, array $b): int {
        return ((int)($b['updatedAt'] ?? 0)) <=> ((int)($a['updatedAt'] ?? 0));
    });
    echo json_encode(['ok' => true, 'rooms' => $list], JSON_UNESCAPED_UNICODE);
    exit;
}

$bodyRaw = file_get_contents('php://input');
if ($bodyRaw !== false && strlen($bodyRaw) > 4096) {
    http_response_code(413);
    echo json_encode(['ok' => false, 'error' => 'payload_too_large']);
    exit;
}
$body = json_decode($bodyRaw ?: '{}', true);
if (!is_array($body)) {
    $body = [];
}

$rooms = loadRooms($storeFile, $now, $ttlSeconds);

if ($action === 'upsert') {
    $code = substr(preg_replace('/[^a-z0-9-]/', '', strtolower((string)($body['code'] ?? ''))), 0, 16);
    if ($code === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_code']);
        exit;
    }
    if (!isset($rooms[$code]) && count($rooms) >= 200) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'directory_full']);
        exit;
    }
    $name = trim(mb_substr((string)($body['name'] ?? 'OpenHax Oda'), 0, 32));
    $hostName = trim(mb_substr((string)($body['hostName'] ?? 'Kurucu'), 0, 20));
    $stadium = (string)($body['stadium'] ?? 'classic');
    $allowedStadiums = [
        'classic', 'big', 'huge', 'futsal', 'tiny', 'long',
        'arena_3v3', 'mini_fast', 'wide_wing', 'penalty_box',
        'hbs_classic', 'hbs_easy', 'hbs_small', 'hbs_rounded',
        'hbs_big', 'hbs_big_easy', 'hbs_huge'
    ];
    if (!in_array($stadium, $allowedStadiums, true)) {
        $stadium = 'classic';
    }
    $players = max(1, min(20, (int)($body['players'] ?? 1)));
    $bots = max(0, min(16, (int)($body['bots'] ?? 0)));
    $maxPlayers = max(2, min(20, (int)($body['maxPlayers'] ?? 8)));
    $hasPassword = !empty($body['hasPassword']);
    $country = substr(preg_replace('/[^A-Z]/', '', strtoupper((string)($body['country'] ?? 'TR'))), 0, 2);
    if ($country === '') {
        $country = 'TR';
    }

    $rooms[$code] = [
        'code' => $code,
        'name' => $name !== '' ? $name : ('Oda ' . $code),
        'hostName' => $hostName !== '' ? $hostName : 'Kurucu',
        'stadium' => $stadium,
        'players' => $players,
        'bots' => $bots,
        'maxPlayers' => $maxPlayers,
        'hasPassword' => $hasPassword,
        'country' => $country,
        'updatedAt' => $now
    ];
    saveRooms($storeFile, $rooms);
    echo json_encode(['ok' => true]);
    exit;
}

if ($action === 'remove') {
    $code = preg_replace('/[^a-z0-9-]/', '', strtolower((string)($body['code'] ?? '')));
    if ($code !== '' && isset($rooms[$code])) {
        unset($rooms[$code]);
        saveRooms($storeFile, $rooms);
    }
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'unknown_action']);
