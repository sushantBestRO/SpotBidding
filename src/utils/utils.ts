export function formatDateTime(dateStr: string | Date | null) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;

    console.log('[formatDateTime] Input:', dateStr);
    console.log('[formatDateTime] Date object UTC:', d.toISOString());

    // Get IST time components using Intl.DateTimeFormat
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || '00';
    const month = parts.find(p => p.type === 'month')?.value || '00';
    const year = parts.find(p => p.type === 'year')?.value || '0000';
    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';

    const result = `${day}/${month}/${year} ${hour}:${minute}`;
    console.log('[formatDateTime] Output IST:', result);
    return result;
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

export function formatDateWithAMPM(dateStr: string | Date | null): string | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;

    // Get IST time components using Intl.DateTimeFormat
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    const parts = formatter.formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || '00';
    const month = parts.find(p => p.type === 'month')?.value || 'Jan';
    const year = parts.find(p => p.type === 'year')?.value || '0000';
    const hour = parts.find(p => p.type === 'hour')?.value || '00';
    const minute = parts.find(p => p.type === 'minute')?.value || '00';
    const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || 'AM';

    return `${day} ${month} ${year} ${hour}:${minute} ${dayPeriod}`;
}