import { AudienceDB } from './audience.db';

const audienceDB = new AudienceDB();

export class AudienceService {
  async createSegment(segmentData: any) {
    // 1. Basic validation
    if (!segmentData?.name || segmentData.name.trim() === '') {
      throw new Error('Segment name is required');
    }

    // 2. Create segment in DB
    const segment = await audienceDB.createSegment({
      name: segmentData.name,
      description: segmentData.description,
      created_by: segmentData.created_by,
    });

    return segment;
  }

  async addSegmentMembers(segmentId: string, userIds: string[]) {
    // 1. Validate segmentId
    if (!segmentId) {
      throw new Error('segmentId is required');
    }

    // 2. Validate users
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error('user_ids cannot be empty');
    }

    // 3. Optional: remove duplicates before DB insert
    const uniqueUserIds = [...new Set(userIds)];

    // 4. Insert into DB layer
    const result = await audienceDB.addSegmentMembers(segmentId, uniqueUserIds);

    return result;
  }

  async getSegments() {
    const segments = await audienceDB.getSegments();
    return segments;
  }

  async getSegmentUsers(segmentId: string) {
    const user_ids = await audienceDB.getSegmentMembers(segmentId);
    return user_ids;
  }

  async deleteSegment(segmentId: string) {
    const segment = await audienceDB.deleteSegment(segmentId);
    return segment;
  }

  async removeCustomerFromSegment(segmentId: string, userId: string) {
    return await audienceDB.removeCustomerFromSegment(segmentId, userId);
  }
}
