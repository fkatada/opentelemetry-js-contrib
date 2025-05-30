/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as nock from 'nock';
import * as assert from 'assert';
import { instanaAgentDetector } from '../src';
import { detectResources } from '@opentelemetry/resources';

describe('[UNIT] instanaAgentDetector', () => {
  describe('when agent is running', () => {
    before(() => {
      process.env.INSTANA_RETRY_TIMEOUT_MS = '100';
    });

    after(() => {
      delete process.env.INSTANA_RETRY_TIMEOUT_MS;
    });

    beforeEach(() => {
      nock.disableNetConnect();
      nock.cleanAll();
    });

    afterEach(() => {
      delete process.env.INSTANA_AGENT_TIMEOUT_MS;
      delete process.env.INSTANA_AGENT_HOST;
      delete process.env.INSTANA_AGENT_PORT;

      nock.enableNetConnect();
      nock.cleanAll();
    });

    it('should return agent resource with default host/port', async () => {
      const mockedReply = {
        pid: 123,
        agentUuid: '14:7d:da:ff:fe:e4:08:d5',
      };

      const scope = nock('http://localhost:42699')
        .persist()
        .put('/com.instana.plugin.nodejs.discovery')
        .reply(200, () => mockedReply);

      const resource = detectResources({ detectors: [instanaAgentDetector] });
      await resource.waitForAsyncAttributes?.();

      scope.done();

      assert.deepEqual(resource.attributes, {
        'process.pid': 123,
        'service.instance.id': '14:7d:da:ff:fe:e4:08:d5',
      });
    });

    it('should return agent resource with env variables', async () => {
      process.env.INSTANA_AGENT_PORT = '56001';
      process.env.INSTANA_AGENT_HOST = 'instanaagent';

      const mockedReply = {
        pid: 222,
        agentUuid: '14:7d:da:ff:fe:e4:08:d5',
      };

      const scope = nock(
        `http://${process.env.INSTANA_AGENT_HOST}:${process.env.INSTANA_AGENT_PORT}`
      )
        .persist()
        .put('/com.instana.plugin.nodejs.discovery')
        .reply(200, () => mockedReply);

      const resource = detectResources({ detectors: [instanaAgentDetector] });
      await resource.waitForAsyncAttributes?.();

      scope.done();

      assert.deepEqual(resource.attributes, {
        'process.pid': 222,
        'service.instance.id': '14:7d:da:ff:fe:e4:08:d5',
      });
    });

    it('agent returns empty resource if request error', async () => {
      const scope = nock('http://localhost:42699')
        .persist()
        .put('/com.instana.plugin.nodejs.discovery')
        .reply(500, () => new Error());

      const resource = detectResources({ detectors: [instanaAgentDetector] });
      await resource.waitForAsyncAttributes?.();

      assert.deepStrictEqual(resource.attributes, {});

      scope.done();
    });

    it('agent return empty resource if timeout', async () => {
      process.env.INSTANA_AGENT_PORT = '56002';
      process.env.INSTANA_AGENT_HOST = 'instanaagent';
      process.env.INSTANA_AGENT_TIMEOUT_MS = '200';

      nock(
        `http://${process.env.INSTANA_AGENT_HOST}:${process.env.INSTANA_AGENT_PORT}`
      )
        .persist()
        .put('/com.instana.plugin.nodejs.discovery')
        .delay(500)
        .reply(200, {});

      const resource = detectResources({ detectors: [instanaAgentDetector] });
      await resource.waitForAsyncAttributes?.();

      assert.deepStrictEqual(resource.attributes, {});
    });
  });

  describe('when agent is not running', () => {
    it('should return empty resource', async () => {
      process.env.INSTANA_AGENT_PORT = '1111';
      process.env.INSTANA_AGENT_TIMEOUT_MS = '100';
      process.env.INSTANA_RETRY_TIMEOUT_MS = '100';

      const resource = detectResources({ detectors: [instanaAgentDetector] });
      await resource.waitForAsyncAttributes?.();

      assert.deepStrictEqual(resource.attributes, {});
    });
  });
});
