import { Router } from 'express';
import { AudienceService } from './audience.service';

export const audienceRouter = Router();

const audienceService = new AudienceService();

audienceRouter.post('/', async (req, res) => {
  try {
    const segment = await audienceService.createSegment(req.body);

    return res.json({
      success: true,
      data: segment,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

audienceRouter.post('/:segmentId/users', async (req, res) => {
  try {
    const { segmentId } = req.params;
    const { user_ids } = req.body;

    const result = await audienceService.addSegmentMembers(segmentId, user_ids);

    return res.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

audienceRouter.get('/', async (req, res) => {
  try {
    const segments = await audienceService.getSegments();

    return res.json({
      success: true,
      data: segments,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

audienceRouter.get('/:segmentId/users', async (req, res) => {
  try {
    const { segmentId } = req.params;

    const users = await audienceService.getSegmentUsers(segmentId);

    return res.json({
      success: true,
      data: users,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

audienceRouter.delete('/:segmentId', async (req, res) => {
  try {
    const { segmentId } = req.params;

    await audienceService.deleteSegment(segmentId);

    return res.json({
      success: true,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

audienceRouter.delete('/:segmentId/users/:userId', async (req, res) => {
  try {
    const { segmentId, userId } = req.params;

    await audienceService.removeCustomerFromSegment(segmentId, userId);

    return res.json({
      success: true,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});
