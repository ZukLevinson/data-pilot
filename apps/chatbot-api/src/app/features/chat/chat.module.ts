import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatPlanner } from './chat.planner';
import { ChatExecutor } from './chat.executor';

@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatPlanner, ChatExecutor],
})
export class ChatModule {}
