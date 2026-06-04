import { Router } from 'express';
import { BroadcastService } from './broadcast.service';

export const broadcastRouter = Router();

const broadcastService = new BroadcastService();

broadcastRouter.post('/', async (req, res) => {
  try {
    const broadcastData = req.body;

    console.log('Received broadcast data:', broadcastData);

    if (!broadcastData) {
      return res
        .status(400)
        .json({ success: false, error: 'Broadcast data is required' });
    }

    const result = await broadcastService.createBroadcast(broadcastData);
    res.status(201).json({ success: true, result });
  } catch (error) {
    console.error('Error occurred while creating broadcast:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

broadcastRouter.get('/', async (req, res) => {
  try {
    const broadcasts = await broadcastService.getBroadcasts();
    res.json({ success: true, data: broadcasts });
  } catch (error) {
    console.error('Error occurred while fetching broadcasts:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

broadcastRouter.delete('/:broadcastId', async (req, res) => {
  try {
    const { broadcastId } = req.params;
    const broadcast = await broadcastService.deleteBroadcast(broadcastId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error occurred while deleting broadcast:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

broadcastRouter.get('/:broadcastId', async (req, res) => {
  try {
    const { broadcastId } = req.params;
    const broadcast = await broadcastService.getBroadcastById(broadcastId);

    if (!broadcast) {
      return res
        .status(404)
        .json({ success: false, error: 'Broadcast not found' });
    }

    res.json({ success: true, data: broadcast });
  } catch (error) {
    console.error('Error occurred while fetching broadcast:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

broadcastRouter.post('/trigger/:broadcastId', async (req, res) => {
  try {
    const { broadcastId } = req.params;
    const broadcast = await broadcastService.triggerBroadcast(broadcastId);

    res.json({ success: true, data: broadcast });
  } catch (error) {
    console.error('Error occurred while sending broadcast:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
