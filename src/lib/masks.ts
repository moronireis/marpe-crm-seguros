// Máscaras e validação de campos (issue #12, checkpoint 15/07).
// Client-side: formatação progressiva enquanto digita. Server-side: normalização
// e rejeição em POST/PATCH /api/contacts (o print do cliente tinha telefone com
// 22 dígitos — sem validação nada impedia).

/** Telefone BR progressivo: "(55) 99999-9999". Aceita 10 ou 11 dígitos (com 9). */
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Válido = vazio (opcional) ou 10-11 dígitos. */
export function validPhone(v: string): boolean {
  const d = v.replace(/\D/g, '');
  return d.length === 0 || d.length === 10 || d.length === 11;
}

export function validEmail(v: string): boolean {
  if (!v) return true; // opcional
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** CPF (11) ou CNPJ (14) progressivo. */
export function maskCpfCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Válido = vazio, 11 (CPF) ou 14 (CNPJ) dígitos com verificador correto. */
export function validCpfCnpj(v: string): boolean {
  const d = v.replace(/\D/g, '');
  if (d.length === 0) return true;
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    for (const len of [9, 10]) {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i);
      const dig = ((sum * 10) % 11) % 10;
      if (dig !== parseInt(d[len])) return false;
    }
    return true;
  }
  if (d.length === 14) {
    const calc = (len: number) => {
      const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < len; i++) sum += parseInt(d[i]) * weights[i];
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === parseInt(d[12]) && calc(13) === parseInt(d[13]);
  }
  return false;
}

export function maskCep(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Percentual 0-100 com até 1 casa; usado no blur dos campos %. */
export function clampPct(v: string): string {
  if (v === '') return '';
  const n = parseFloat(String(v).replace(',', '.'));
  if (isNaN(n)) return '';
  return String(Math.min(100, Math.max(0, Math.round(n * 10) / 10)));
}
