import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: {
            modelName: 'test-model',
            embeddingModel: 'test-embed',
            processChatStream: jest.fn(),
            getHealth: jest.fn().mockResolvedValue({ database: 'online', llm: 'online' }),
          },
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getConfig', () => {
    it('should return chat config with health', async () => {
      const config = await controller.getConfig();
      expect(config).toEqual({
        modelName: 'test-model',
        embeddingModel: 'test-embed',
        health: { database: 'online', llm: 'online' },
      });
    });
  });
});
