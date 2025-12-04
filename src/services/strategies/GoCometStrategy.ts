import { IBiddingStrategy, BiddingData } from './IBiddingStrategy';
import { goCometApi, getHeaders } from '../goCometService';

export class GoCometStrategy implements IBiddingStrategy {
    name = 'GoComet';

    async fetchBiddingData(enquiryKey: string, authToken: string): Promise<BiddingData> {
        const url = `/api/v1/vendor/enquiries/${enquiryKey}/bidding-data`;
        const response = await goCometApi.get(url, { headers: getHeaders(authToken) });
        const data = response.data;

        return {
            vendorRank: data.vendor_rank,
            bidClosingIn: data.bid_closing_in,
            revisionsLeft: data.revisions_left || 3,
            bidCloseTime: data.bid_close_time
        };
    }

    async submitBid(quoteId: string, amount: number, authToken: string): Promise<boolean> {
        // Implementation for GoComet bid submission
        // This would contain the payload construction logic
        return true;
    }

    async getQuoteDetails(enquiryKey: string, authToken: string): Promise<any> {
        const url = `/api/v1/vendor/enquiries/${enquiryKey}/quotes`;
        const response = await goCometApi.get(url, { headers: getHeaders(authToken) });
        return response.data[0];
    }
}
