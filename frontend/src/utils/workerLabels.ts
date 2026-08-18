// Общие лейблы для отображения параметров воркера/слота
// (используются в основном списке слотов — SlotCard — и в админ-профиле пользователя).

export const osLabel = (idRaw?: unknown): string => {
    if (idRaw === undefined || idRaw === null) return "—";

    const num =
        typeof idRaw === "number"
            ? idRaw
            : typeof idRaw === "string" && /^\d+$/.test(idRaw)
                ? Number(idRaw)
                : null;

    if (num !== null) {
        if (num === 3) return "Android";
        if (num === 2) return "MacOS";
        if (num === 1) return "Windows";
        return `#${num}`;
    }

    if (typeof idRaw === "string") {
        const norm = idRaw.trim().toLowerCase();
        if (norm.includes("mac")) return "MacOS";
        if (norm.includes("win")) return "Windows";
        if (norm.includes("linux")) return "Linux";
        if (norm.includes("android")) return "Android";

        return idRaw;
    }

    return "—";
};

export const browserCoreLabel = (raw: unknown): string => {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
        const o = raw as Record<string, unknown>;
        const name = o.name ?? o.title ?? o.label;
        if (typeof name === "string" && name.trim()) return name.trim();
    }

    const num =
        typeof raw === "number"
            ? raw
            : typeof raw === "string" && /^\d+$/.test(raw)
                ? Number(raw)
                : null;

    if (num !== null) {
        if (num === 1) return "Chrome";
        if (num === 2) return "Firefox";
        return `#${num}`;
    }
    if (typeof raw === "string" && raw.trim()) return raw;
    return "—";
};
