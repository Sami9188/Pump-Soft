import moment from 'moment';

export function calculateAmountOwed(account, transactions) {
    if (account.accountType !== 'staff' || !account.salary) return 0;

    let startDate = new Date(account.createdAt);
    const totalPaid = transactions
        .filter(tx => tx.transactionType === 'pay')
        .reduce((sum, { amount }) => sum + parseFloat(amount || 0), 0);
    const dailyRate = parseFloat(account.salary) / 30;
    const daysWorked = Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24));
    const totalEarned = dailyRate * daysWorked;
    return Math.round((totalEarned - totalPaid) * 100) / 100;
}

export function getFinancialStatus(account, transactions) {
    if (account.accountType === 'staff') {
        const amountOwed = calculateAmountOwed(account, transactions);
        if (amountOwed > 0) {
            return `We owe Rs ${amountOwed.toFixed(2)}`;
        } else if (amountOwed < 0) {
            return `They owe Rs ${(-amountOwed).toFixed(2)}`;
        } else {
            return 'Settled';
        }
    } else {
        const balance = account.currentBalance || 0;
        if (balance > 0) {
            return `We owe Rs ${balance.toFixed(2)}`;
        } else if (balance < 0) {
            return `They owe Rs ${(-balance).toFixed(2)}`;
        } else {
            return 'Settled';
        }
    }
}