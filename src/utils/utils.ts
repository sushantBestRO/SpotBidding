export function formatDateTime(dateStr: string) {
    const d = new Date(dateStr);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${mins}`;
}

// Helper to safely parse dates
export function parseDate(dateStr: any): Date | null {
    if (!dateStr) return null;
    return new Date(dateStr);
}

// Helper to safely parse unix timestamps (seconds)
export function parseTimestamp(timestamp: any): Date | null {
    if (!timestamp) return null;
    const num = Number(timestamp);
    if (isNaN(num)) return null;
    const date = new Date(num * 1000);
    return isNaN(date.getTime()) ? null : date;
}

export function parseISTDate(dateStr: string | null): Date | null {
    if (!dateStr) return null;

    // Expected format: DD/MM/YYYY HH:mm
    const [datePart, timePart] = dateStr.split(' ');
    const [dd, mm, yyyy] = datePart.split('/');
    const [hh, min] = timePart.split(':');

    const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`;
    const d = new Date(iso);

    return isNaN(d.getTime()) ? null : d;
}