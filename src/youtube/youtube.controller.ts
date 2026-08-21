import { Controller, Get, Post } from '@nestjs/common';
import { YoutubeService } from './youtube.service';

@Controller('youtube')
export class YoutubeController {
  constructor(private readonly youtube: YoutubeService) {}

  @Post('run')
  async run() {
    return this.youtube.runDailyCollection(new Date());
  }

  @Get('runs/latest')
  async getLatestRun() {
    return this.youtube.getLatestRun();
  }

  @Get('videos/board')
  async getBoard() {
    return this.youtube.getBoard();
  }
}
