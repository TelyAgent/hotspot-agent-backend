import { Test } from '@nestjs/testing';
import { TestingModule } from '@nestjs/testing';
import { CollectionController } from '../../src/collection/collection.controller';
import { CollectionModule } from '../../src/collection/collection.module';

describe('CollectionModule', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    await moduleRef?.close();
  });

  it('wires collection dependencies with the default X config', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CollectionModule],
    }).compile();

    const controller = moduleRef.get(CollectionController);
    const config = await controller.getPlatformConfig('x');

    expect(config.variables.regions).toEqual(['global']);
    expect(config.variables.regionWoeids).toEqual({ global: 1 });
  });
});
