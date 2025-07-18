import { message } from "antd";
import { ltrArray, mmArray } from "../data/dipdata";


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
    const now = new Date();
    const targetDate = new Date(timestamp);
    const timeDifference = now - targetDate;

    const seconds = Math.floor(timeDifference / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    if (seconds < 60) {
        return 'just now';
    } else if (minutes === 1) {
        return 'a minute ago';
    } else if (minutes < 60) {
        return `${minutes} minutes ago`;
    } else if (hours === 1) {
        return 'an hour ago';
    } else if (hours < 24) {
        return `${hours} hours ago`;
    } else if (days === 1) {
        return `yesterday at ${dayjs(targetDate).format("hh:mm A")}`;
    } else if (days <= 7) {
        return `${dayjs(targetDate).format("DD MMMM [at] hh:mm A")}`;
    } else if (weeks === 1) {
        return 'a week ago';
    } else {
        return `${dayjs(targetDate).format("DD MMMM [at] HH:mm ")}`
    }
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
