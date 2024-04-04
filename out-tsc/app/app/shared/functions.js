// TODO: remove after then updating to last version of ngx-components
import { isEmptyArray, isNil, isNotNil } from '@sumaris-net/ngx-components';
export function isNilOrNaN(obj) {
    return obj === undefined || obj === null || (typeof obj === 'number' && isNaN(obj));
}
export function mergeLoadResult(res1, res2) {
    var _a, _b;
    return {
        data: (res1.data || []).concat(...res2.data),
        total: ((res1.total || ((_a = res1.data) === null || _a === void 0 ? void 0 : _a.length) || 0) + (res2.total || ((_b = res2.data) === null || _b === void 0 ? void 0 : _b.length) || 0))
    };
}
/**
 * Arrondi une valeur décimal à demi-valeur supérieur, suivant le nombre de décimales demandé.<br>
 * Exemples:
 * <ul>
 *  <li> round(0.01, 1) => '0.0'
 *  <li> round(0.08, 1) => '0.1'
 * </ul>
 *
 * @param value
 * @param maxDecimals
 */
export function roundHalfUp(value, maxDecimals) {
    if (isNil(maxDecimals))
        return Math.trunc(+value + 0.5);
    const divider = maxDecimals ? Math.pow(10, maxDecimals) : 1;
    return Math.trunc(+value * divider + 0.5) / divider;
}
// Compare two items
export function equals(item1, item2) {
    // Get the object type
    const itemType = Object.prototype.toString.call(item1);
    // If an object or array, compare recursively
    if (['[object Array]', '[object Object]'].indexOf(itemType) >= 0) {
        return arrayEquals(item1, item2);
    }
    // Otherwise, do a simple comparison
    // If the two items are not the same type, return false
    if (itemType !== Object.prototype.toString.call(item2))
        return false;
    // Else if it's a function, convert to a string and compare
    if (itemType === '[object Function]') {
        return item1.toString() === item2.toString();
    }
    // Otherwise, just compare
    return item1 === item2;
}
export function arrayEquals(value, other) {
    // Get the value type
    const type = Object.prototype.toString.call(value);
    // If the two objects are not the same type, return false
    if (type !== Object.prototype.toString.call(other))
        return false;
    // If items are not an object or array, return false
    if (['[object Array]', '[object Object]'].indexOf(type) < 0)
        return false;
    // Compare the length of the length of the two items
    const valueLen = type === '[object Array]' ? value.length : Object.keys(value).length;
    const otherLen = type === '[object Array]' ? other.length : Object.keys(other).length;
    if (valueLen !== otherLen)
        return false;
    // Compare properties
    if (type === '[object Array]') {
        for (let i = 0; i < valueLen; i++) {
            if (equals(value[i], other[i]) === false)
                return false;
        }
    }
    else {
        for (const key in value) {
            if (!equals(value[key], other[key]))
                return false;
        }
    }
    // If nothing failed, return true
    return true;
}
export function arrayPluck(array, key, omitNil) {
    return (omitNil !== true) ?
        (array || []).map(value => value && value[key]) :
        (array || []).map(value => value && value[key]).filter(isNotNil);
}
/**
 * Count how many times a search string occur
 *
 * @param value
 * @param searchString
 */
export function countSubString(value, searchString) {
    return value.split(searchString).length - 1;
}
/**
 * Split an array, into a map of array, group by property
 */
export function collectByFunction(values, getKey) {
    return (values || []).reduce((res, item) => {
        const key = getKey(item);
        if (typeof key === 'number' || typeof key === 'string') {
            res[key] = res[key] || [];
            res[key].push(item);
        }
        return res;
    }, {});
}
export function intersectArrays(values) {
    if (isEmptyArray(values))
        return [];
    // Utilise la méthode reduce pour obtenir l'intersection des tableaux
    return values.reduce((acc, curr) => acc.filter(x => curr.includes(x)), values[0].slice());
}
export function noHtml(value) {
    if (value && typeof value === 'string') {
        // Use regular expression to remove all HTML tags
        return value.replace(/<[^>]*>.*?<\/[^>]*>|<[^>]+>/g, '');
    }
    else {
        return value;
    }
}
//# sourceMappingURL=functions.js.map