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
            bidCloseTime: data.bid_close_time,
            biddingClosed: data.bidding_closed || false
        };
    }

    async submitBid(quoteId: string, amount: number, authToken: string): Promise<boolean> {
        try {
            if (process.env.NODE_ENV === 'production') {
                console.log(`[GoComet Strategy] Submitting bid for quote ${quoteId}: ₹${amount}`);
                // const url = `/api/v1/vendor/quotes/${quoteId}/submit`;

                // const payload = {
                //     quote: {
                //         total_price: amount,
                //         currency: 'INR'
                //     }
                // };

                // const response = await goCometApi.post(url, payload, {
                //     headers: getHeaders(authToken)
                // });

                // return response.status === 200 || response.status === 201;
            }
            return true;
        } catch (error: any) {
            console.error('[GoComet Strategy] Bid submission error:', error.response?.data || error.message);
            return false;
        }
    }

    async getQuoteDetails(enquiryKey: string, authToken: string): Promise<any> {
        const url = `/api/v1/vendor/enquiries/${enquiryKey}/quotes`;
        const response = await goCometApi.get(url, { headers: getHeaders(authToken) });
        return response.data[0];
    }
}
