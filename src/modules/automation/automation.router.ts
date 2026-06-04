import { Router } from 'express';
import { AutomationService } from './automation.service';
import { UUID } from 'crypto';

export const automationRouter = Router();

const automationService = new AutomationService();

automationRouter.post('/', async (req, res) => {
  try {
    const automationData = req.body;

    if (!automationData) {
      return res.status(400).json({ error: 'Automation data is required' });
    }

    const result = await automationService.createAutomation(automationData);
    res.status(201).json({ success: true, result });
  } catch (error) {
    console.error('Error occurred while triggering automation:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

automationRouter.get('/', async (req, res) => {
  try {
    const result = await automationService.getAutomations();
    res.status(200).json({ success: true, automations: result });
  } catch (error) {
    console.error('Error occurred while fetching automations:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

automationRouter.get('/:id', async (req, res) => {
  try {
    const automationId = req.params.id as UUID;

    if (!automationId) {
      return res
        .status(400)
        .json({ success: false, error: 'Automation ID is required' });
    }

    const result = await automationService.getAutomationById(automationId);

    if (!result) {
      return res
        .status(404)
        .json({ success: false, error: 'Automation not found' });
    }

    res.status(200).json({ success: true, automation: result });
  } catch (error) {
    console.error('Error occurred while fetching automation by ID:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

automationRouter.patch('/:id/toggle', async (req, res) => {
  try {
    const automationId = req.params.id as UUID;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res
        .status(400)
        .json({ success: false, error: 'is_active must be a boolean' });
    }

    const result = await automationService.toggleAutomation(
      automationId,
      is_active
    );

    if (!result) {
      return res
        .status(404)
        .json({ success: false, error: 'Automation not found' });
    }

    res.status(200).json({ success: true, automation: result });
  } catch (error) {
    console.error('Error occurred while toggling automation:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

automationRouter.patch('/:id', async (req, res) => {
  try {
    const automationId = req.params.id as UUID;
    const updateData = req.body;

    console.log('Received update data:', req.body);

    if (!updateData || Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Update data is required' });
    }

    const result = await automationService.updateAutomation(
      automationId,
      updateData
    );

    if (!result) {
      return res
        .status(404)
        .json({ success: false, error: 'Automation not found' });
    }

    res.status(200).json({ success: true, automation: result });
  } catch (error) {
    console.error('Error occurred while updating automation:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
