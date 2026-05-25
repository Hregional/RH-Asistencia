const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];

const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];

export function numeroALetras(n: number): string {
    if (n === 0) return 'CERO';
    if (n < 20) return UNIDADES[n];
    if (n < 30) return n === 20 ? 'VEINTE' : 'VEINTI' + UNIDADES[n - 20];
    const dec = Math.floor(n / 10);
    const uni = n % 10;
    return uni === 0 ? DECENAS[dec] : DECENAS[dec] + ' Y ' + UNIDADES[uni];
}