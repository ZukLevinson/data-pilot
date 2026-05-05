import { Module } from '@nestjs/common';
import { DatabaseModule } from './core/database/database.module';
import { ChatModule } from './features/chat/chat.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [DatabaseModule, ChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
