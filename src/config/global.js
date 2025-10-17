import { message } from "antd";
import { ltrArray, mmArray } from "../data/dipdata";
import TimezoneService from "../services/timezoneService";


window.toastify = (msg, type) => {

    switch (type) {
        case "success":
            message.success(msg)
            break;
        case "error":
            message.error(msg)
            break;
        case "warning":
            message.warning(msg)
            break;
        default:
            message.info(msg)
    }
}

window.getRandomId = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

window.getTimeAgo = (timestamp = "") => {
    return TimezoneService.getTimeAgo(timestamp);
}

window.getLiters = (mm) => {
    if (mm < mmArray[0]) return 0;
    if (mm > mmArray[mmArray.length - 1]) return ltrArray[ltrArray.length - 1];
    for (let i = 0; i < mmArray.length - 1; i++) {
        if (mm >= mmArray[i] && mm <= mmArray[i + 1]) {
            const slope = (ltrArray[i + 1] - ltrArray[i]) / (mmArray[i + 1] - mmArray[i]);
            const liters = ltrArray[i] + slope * (mm - mmArray[i]);
            return Number(liters?.toFixed(1));
        }
    }
    return null;
};
