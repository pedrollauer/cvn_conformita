// A product family is the first four numeric digits of a part's code/filename (e.g.
// "732182716212.SLDPRT" -> "7321"); a code that doesn't start with 4 digits falls into "Other".
export function familyOf(code: string): string {
    const match = /^(\d{4})/.exec(code);
    return match ? match[1] : "Other";
}
