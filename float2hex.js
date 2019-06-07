const Float32ToHex = (float32) => {
    const getHex = i => ('00' + i.toString(16)).slice(-2);
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, float32);
    return Array.apply(null, { length: 4 }).map((_, i) => getHex(view.getUint8(i))).join('');
};

const HexToFloat32 = (str) => {
    const int = parseInt(str, 16);
    if (int > 0 || int < 0) {
        const sign = (int >>> 31) ? -1 : 1;
        let exp = (int >>> 23 & 0xff) - 127;
        const mantissa = ((int & 0x7fffff) + 0x800000).toString(2);
        let float32 = 0;
        for (let i = 0; i < mantissa.length; i++) {
            float32 += parseInt(mantissa[i]) ? Math.pow(2, exp) : 0;
            exp--;
        }
        return float32 * sign;
    } else return 0
};

const SwapEndianness = (hex) => {
    let swapped = "";
    for (let i=0; i<hex.length; i+=2) {
        swapped = hex.substr(i, 2) + swapped;
    }
    return swapped;
};

module.exports = {
    Float32ToHex,
    HexToFloat32,
    SwapEndianness,
};
